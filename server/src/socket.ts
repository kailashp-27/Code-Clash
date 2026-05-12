import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

export interface JoinQueuePayload {
  mode?: 'ranked';
  username?: string;
}

export interface MatchFoundPayload {
  roomId: string;
  endTime: number;
  players: Record<string, { username: string; rating: number }>;
  problems: {
    id: string;
    title: string;
    description: string;
    totalTestCases: number;
  }[];
}

export interface ClientToServerEvents {
  join_queue: (payload?: JoinQueuePayload) => void;
  join_battle: (payload: { roomId: string }) => void;
  test_case_update: (payload: { roomId: string; passedCases: number; totalCases: number }) => void;
  forfeit_match: (payload: { roomId: string }) => void;
  trigger_tiebreaker: (payload: { roomId: string }) => void;
}

export interface ServerToClientEvents {
  match_found: (payload: MatchFoundPayload) => void;
  opponent_test_update: (payload: { passedCases: number; totalCases: number }) => void;
  battle_sync: (payload: any) => void;
  match_over: (payload: { winner: string; loser: string; reason: string; ratingChange: number }) => void;
}

const PLACEHOLDER_PROBLEM_SHORTCODE = 'CC-PLACEHOLDER-001';

async function getOrCreatePlaceholderProblemId(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.problem.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) return existing.id;

  const created = await prisma.problem.upsert({
    where: { shortCode: PLACEHOLDER_PROBLEM_SHORTCODE },
    update: {},
    create: {
      shortCode: PLACEHOLDER_PROBLEM_SHORTCODE,
      title: 'Placeholder Problem',
      description: 'Temporary placeholder problem for matchmaking.',
      difficulty: 'EASY',
    },
    select: { id: true },
  });

  return created.id;
}

async function ensureUserForSocket(
  prisma: PrismaClient,
  socketId: string,
  socketIdToUserId: Map<string, string>,
): Promise<{ id: string; rating: number }> {
  const existingId = socketIdToUserId.get(socketId);
  if (existingId) {
    const existing = await prisma.user.findUnique({ where: { id: existingId }, select: { id: true, rating: true } });
    if (existing) return existing;
  }

  const created = await prisma.user.create({
    data: {
      username: `guest-${socketId}`,
      email: `guest-${socketId}@codeclash.local`,
      password: 'guest-password-placeholder',
    },
    select: { id: true, rating: true },
  });

  socketIdToUserId.set(socketId, created.id);
  return created;
}

export function initSocketServer(httpServer: HttpServer, prisma: PrismaClient) {
  // Simple in-memory queue storing socket IDs
  const rankedQueue: string[] = [];
  const socketIdToUserId = new Map<string, string>();
  const socketIdToUsername = new Map<string, string>();
  const socketIdToRoomId = new Map<string, string>();
  const roomPlayers = new Map<string, string[]>();

  const handleMatchResolution = async (roomId: string, winnerSocketId: string, loserSocketId: string, reason: string) => {
    const winnerUserId = socketIdToUserId.get(winnerSocketId);
    const loserUserId = socketIdToUserId.get(loserSocketId);

    const winnerUsername = socketIdToUsername.get(winnerSocketId) || 'Unknown';
    const loserUsername = socketIdToUsername.get(loserSocketId) || 'Unknown';

    const RATING_CHANGE = 25;

    io.to(roomId).emit('match_over', { 
      winner: winnerUsername, 
      loser: loserUsername, 
      reason,
      ratingChange: RATING_CHANGE
    });

    if (winnerUserId && loserUserId) {
      try {
        await prisma.$transaction([
          prisma.user.update({
            where: { id: winnerUserId },
            data: { rating: { increment: RATING_CHANGE }, wins: { increment: 1 } }
          }),
          prisma.user.update({
            where: { id: loserUserId },
            data: { rating: { decrement: RATING_CHANGE }, losses: { increment: 1 } }
          }),
          prisma.match.updateMany({
            where: { id: roomId, status: 'IN_PROGRESS' },
            data: {
              status: 'COMPLETED',
              winnerId: winnerUserId,
              loserId: loserUserId,
              winnerRatingChange: RATING_CHANGE,
              loserRatingChange: -RATING_CHANGE,
              endedAt: new Date()
            }
          })
        ]);
        console.log(`[matchmaking] Match ${roomId} resolved. ${winnerUsername} won.`);
      } catch (err) {
        console.error('[matchmaking] Error updating match stats:', err);
      }
    }

    socketIdToRoomId.delete(winnerSocketId);
    socketIdToRoomId.delete(loserSocketId);
    roomPlayers.delete(roomId);
  };

  const triggerForfeit = (socketId: string) => {
    const roomId = socketIdToRoomId.get(socketId);
    if (!roomId) return;
    const playersInRoom = roomPlayers.get(roomId);
    if (!playersInRoom) return;
    const loserSocketId = socketId;
    const winnerSocketId = playersInRoom.find(id => id !== loserSocketId);
    if (!winnerSocketId) return;
    handleMatchResolution(roomId, winnerSocketId, loserSocketId, 'forfeit').catch(err => console.error('[Match Resolution Error]', err));
  };

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: ["http://localhost:5173", "http://localhost:5174"],
      methods: ["GET", "POST"],
    },
  });

  async function tryMatchmake(): Promise<void> {
    console.log(`[matchmaking] tryMatchmake called. Queue: [${rankedQueue.join(', ')}] (size: ${rankedQueue.length})`);

    while (rankedQueue.length >= 2) {
      const player1SocketId = rankedQueue.shift();
      const player2SocketId = rankedQueue.shift();

      if (!player1SocketId || !player2SocketId) {
        console.warn('[matchmaking] Unexpected: shift returned undefined despite length >= 2');
        return;
      }

      // Verify both sockets are still connected before creating a match
      const s1 = io.sockets.sockets.get(player1SocketId);
      const s2 = io.sockets.sockets.get(player2SocketId);

      if (!s1 || !s2) {
        console.warn(`[matchmaking] Stale socket detected. s1=${!!s1} s2=${!!s2}. Re-queuing valid socket.`);
        // Re-queue the one that's still alive
        if (s1) rankedQueue.push(player1SocketId);
        if (s2) rankedQueue.push(player2SocketId);
        continue;
      }

      const roomId = randomUUID();
      console.log(`[matchmaking] ✅ MATCH FOUND! Room: ${roomId}`);
      console.log(`[matchmaking]    Player 1: ${player1SocketId}`);
      console.log(`[matchmaking]    Player 2: ${player2SocketId}`);

      s1.join(roomId);
      s2.join(roomId);

      let p1Info, p2Info, problemId;
      try {
        problemId = await getOrCreatePlaceholderProblemId(prisma);

        [p1Info, p2Info] = await Promise.all([
          ensureUserForSocket(prisma, player1SocketId, socketIdToUserId),
          ensureUserForSocket(prisma, player2SocketId, socketIdToUserId),
        ]);

        await prisma.match.create({
          data: {
            id: roomId,
            problemId,
            player1Id: p1Info.id,
            player2Id: p2Info.id,
            status: 'IN_PROGRESS',
          },
        });

        console.log(`[matchmaking] Match record created in DB (roomId: ${roomId})`);
      } catch (dbError) {
        console.error('[matchmaking] ❌ DB error while creating match:', dbError);
      }

      const p1Name = socketIdToUsername.get(player1SocketId) || "Player 1";
      const p2Name = socketIdToUsername.get(player2SocketId) || "Player 2";
      const p1Rating = p1Info?.rating ?? 1200;
      const p2Rating = p2Info?.rating ?? 1200;

      socketIdToRoomId.set(player1SocketId, roomId);
      socketIdToRoomId.set(player2SocketId, roomId);
      roomPlayers.set(roomId, [player1SocketId, player2SocketId]);

      const matchPayload: MatchFoundPayload = {
        roomId,
        endTime: Date.now() + 75 * 60 * 1000,
        players: { 
          [player1SocketId]: { username: p1Name, rating: p1Rating }, 
          [player2SocketId]: { username: p2Name, rating: p2Rating } 
        },
        problems: [
          {
            id: 'mock-1',
            title: 'Two Sum',
            description: 'Given an array of integers `nums` and an integer `target`, return indices of the two numbers such that they add up to `target`. You may assume that each input would have exactly one solution, and you may not use the same element twice.',
            totalTestCases: 10,
          },
          {
            id: 'mock-2',
            title: 'Valid Parentheses',
            description: 'Given a string `s` containing just the characters `(`, `)`, `{`, `}`, `[` and `]`, determine if the input string is valid.',
            totalTestCases: 15,
          },
          {
            id: 'mock-3',
            title: 'Boss: Merge k Sorted Lists',
            description: 'You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order. Merge all the linked-lists into one sorted linked-list and return it.',
            totalTestCases: 25,
          }
        ]
      };

      console.log(`[matchmaking] Emitting match_found to ${player1SocketId} and ${player2SocketId}`);
      io.to(player1SocketId).emit('match_found', matchPayload);
      io.to(player2SocketId).emit('match_found', matchPayload);
      console.log(`[matchmaking] ✅ match_found emitted successfully`);
    }

    console.log(`[matchmaking] Queue exhausted or < 2 players. Remaining: ${rankedQueue.length}`);
  }

  io.on('connection', (socket) => {
    console.log(`[socket] ✅ New connection: ${socket.id}`);

    socket.on('join_queue', async (payload) => {
      console.log(`[socket] join_queue received from ${socket.id}`);
      socketIdToUsername.set(socket.id, payload?.username || 'Guest');
      console.log(`[socket] Queue BEFORE add: [${rankedQueue.join(', ')}] (size: ${rankedQueue.length})`);

      // Prevent duplicate entries
      if (rankedQueue.includes(socket.id)) {
        console.log(`[socket] ⚠️ ${socket.id} already in queue. Ignoring.`);
        return;
      }

      rankedQueue.push(socket.id);
      console.log("Current Queue Size:", rankedQueue.length);
      console.log(`[socket] Queue AFTER add: [${rankedQueue.join(', ')}] (size: ${rankedQueue.length})`);

      try {
        await tryMatchmake();
      } catch (error) {
        // If matchmaking fails, remove the user from the queue to avoid stuck entries.
        const idx = rankedQueue.indexOf(socket.id);
        if (idx !== -1) rankedQueue.splice(idx, 1);
        console.error('[socket] ❌ join_queue/matchmaking failed:', error);
      }
    });

    socket.on('join_battle', ({ roomId }) => {
      socket.join(roomId);
      console.log(`[socket] User ${socket.id} joined battle room: ${roomId}`);
      
      socket.emit('battle_sync', {
        endTime: Date.now() + 60 * 60 * 1000,
        phase: 'standard',
        problems: [
          { id: 'p1', title: 'Two Sum', difficulty: 'Easy', description: 'Given an array of integers nums and an integer target...', totalTestCases: 4, sampleTestCase: 'Input: nums = [2,7,11,15], target = 9\nOutput: [0,1]' },
          { id: 'p2', title: 'Valid Parentheses', difficulty: 'Medium', description: 'Given a string s containing just the characters...', totalTestCases: 6, sampleTestCase: 'Input: s = "()[]{}"\nOutput: true' },
          { id: 'p3', title: 'Trapping Rain Water', difficulty: 'Boss', description: 'Given n non-negative integers representing an elevation map...', totalTestCases: 10, isBoss: true, sampleTestCase: 'Input: height = [0,1,0,2,1,0,1,3,2,1,2,1]\nOutput: 6' }
        ]
      });
    });

    socket.on('test_case_update', ({ roomId, passedCases, totalCases }) => {
      socket.to(roomId).emit('opponent_test_update', { passedCases, totalCases });
      if (passedCases === totalCases && totalCases > 0) {
        const playersInRoom = roomPlayers.get(roomId);
        if (playersInRoom) {
          const winnerSocketId = socket.id;
          const loserSocketId = playersInRoom.find(id => id !== winnerSocketId);
          if (loserSocketId) {
            handleMatchResolution(roomId, winnerSocketId, loserSocketId, 'victory').catch(err => console.error('[Match Resolution Error]', err));
          }
        }
      }
    });

    socket.on('forfeit_match', ({ roomId }) => {
      triggerForfeit(socket.id);
    });

    socket.on('trigger_tiebreaker', ({ roomId }) => {
      io.to(roomId).emit('battle_sync', {
        endTime: Date.now() + 45 * 60 * 1000,
        phase: 'boss'
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[socket] ❌ Disconnected: ${socket.id} (reason: ${reason})`);
      console.log(`[socket] Queue BEFORE disconnect cleanup: [${rankedQueue.join(', ')}] (size: ${rankedQueue.length})`);

      const idx = rankedQueue.indexOf(socket.id);
      if (idx !== -1) {
        rankedQueue.splice(idx, 1);
        console.log(`[socket] Removed ${socket.id} from queue`);
      }

      socketIdToUserId.delete(socket.id);
      triggerForfeit(socket.id);
      console.log(`[socket] Queue AFTER disconnect cleanup: [${rankedQueue.join(', ')}] (size: ${rankedQueue.length})`);
    });
  });

  console.log('[socket] Socket.io server initialized.');
  return io;
}
