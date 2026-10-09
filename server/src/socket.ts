import type { PrismaClient } from '@prisma/client';
import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { RankedQueue } from './matchmaking.js';
import { BattleService } from './battles.js';

interface Player { id: string; username: string; rating: number }
export interface SocketOptions { jwtSecret: string; clientOrigins: string[]; disconnectGraceMs?: number; matchDurationMs?: number; battles?: BattleService }
export function initSocketServer(httpServer: HttpServer, prisma: PrismaClient, options: SocketOptions) {
  const io = new Server(httpServer, { cors: { origin: options.clientOrigins, methods: ['GET', 'POST'] } });
  const battles = options.battles ?? new BattleService(prisma, { judge0Url: 'http://localhost:2358', ...(options.matchDurationMs ? { matchDurationMs: options.matchDurationMs } : {}) });
  const queue = new RankedQueue();
  const pairingUsers = new Set<string>();
  const queueIntents = new Map<string, symbol>();
  const disconnected = new Map<string, ReturnType<typeof setTimeout>>();
  const resolving = new Set<string>();
  let matchmaking = false;
  const error = (id: string, code: string, message: string) => io.to(id).emit('server_error', { code, message });
  const hasSocket = (id: string) => [...io.sockets.sockets.values()].some(s => s.data.user?.id === id && s.connected);
  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token !== 'string') return next(new Error('Sign in to play ranked battles.'));
      const decoded = jwt.verify(token, options.jwtSecret, { algorithms: ['HS256'] });
      if (typeof decoded === 'string' || typeof decoded.userId !== 'string') return next(new Error('Invalid session. Please sign in again.'));
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, username: true, rating: true, bannedAt: true } });
      if (!user) return next(new Error('Account not found. Please sign in again.'));
      if (user.bannedAt) return next(new Error('Account banned from competitive play. Open account standing to appeal.'));
      socket.data.user = user;
      next();
    } catch { next(new Error('Unable to authenticate. Check your session and try again.')); }
  });
  async function broadcast(matchId: string) {
    const sockets = [...io.sockets.sockets.values()].filter(s => s.rooms.has(matchId));
    for (const socket of sockets) {
      try {
        const snapshot = await battles.snapshot(matchId, socket.data.user.id);
        socket.emit('battle_sync', snapshot);
        if (snapshot.result) {
          if (snapshot.status === 'CANCELLED') socket.emit('match_cancelled', { roomId: matchId, reason: snapshot.result.reason });
          else socket.emit('match_over', snapshot.result);
          void socket.leave(matchId);
        }
      } catch (e) { console.error('[socket] Sync failed', e instanceof Error ? e.message : 'unknown'); }
    }
  }
  battles.options.onUpdate = broadcast;
  async function finish(matchId: string, loserId: string, allGone = false) {
    if (resolving.has(matchId)) return;
    resolving.add(matchId);
    try {
      const snapshot = await battles.snapshot(matchId, loserId);
      if (snapshot.status !== 'IN_PROGRESS' && snapshot.status !== 'DRAINING') return;
      const opponent = Object.keys(snapshot.players).find(id => id !== loserId)!;
      await battles.resolve(matchId, allGone ? null : opponent, allGone ? 'Both players disconnected; ratings unchanged.' : 'Battle ended by forfeit or disconnect grace.', allGone);
    } catch (e) { error(matchId, 'SAVE_FAILED', 'The result could not be saved. Please try leaving again.'); }
    finally { resolving.delete(matchId); }
  }
  function scheduleDisconnect(userId: string, roomId: string) {
    if (disconnected.has(userId)) return;
    disconnected.set(userId, setTimeout(() => {
      disconnected.delete(userId);
      void (async () => {
        if (hasSocket(userId)) return;
        const snapshot = await battles.snapshot(roomId, userId);
        const opponent = Object.keys(snapshot.players).find(id => id !== userId)!;
        await finish(roomId, userId, !hasSocket(opponent));
      })().catch(e => console.error('[disconnect]', e instanceof Error ? e.message : 'unknown'));
    }, options.disconnectGraceMs ?? 30000));
  }
  async function tryMatchmake() {
    if (matchmaking) return;
    matchmaking = true;
    try {
      let pair;
      while ((pair = queue.takePair(Date.now()))) {
        const [first, second] = pair;
        const a = io.sockets.sockets.get(first.socketId), b = io.sockets.sockets.get(second.socketId);
        if (!a?.connected || !b?.connected) { if (a?.connected) queue.add(first); if (b?.connected) queue.add(second); continue; }
        pairingUsers.add(first.userId); pairingUsers.add(second.userId);
        try {
          const snapshot = await battles.createMatch(a.data.user, b.data.user);
          await a.join(snapshot.roomId); await b.join(snapshot.roomId);
          // A second tab receives the same battle on reconnect; identity belongs to the account.
          a.emit('match_found', snapshot);
          b.emit('match_found', await battles.snapshot(snapshot.roomId, second.userId));
          for (const id of [first.userId, second.userId]) if (!hasSocket(id)) scheduleDisconnect(id, snapshot.roomId);
        } catch (e) {
          console.error('[matchmaking] Failed to create match', e instanceof Error ? e.message : 'unknown');
          for (const player of pair) { io.to(player.socketId).emit('queue_status', { status: 'idle' }); error(player.socketId, 'MATCH_FAILED', 'Unable to create a match. Please queue again.'); }
        } finally { pairingUsers.delete(first.userId); pairingUsers.delete(second.userId); }
      }
    } finally { matchmaking = false; }
  }
  io.on('connection', socket => {
    const user: Player = socket.data.user;
    const timer = disconnected.get(user.id); if (timer) clearTimeout(timer); disconnected.delete(user.id);
    void socket.join(`user:${user.id}`);
    void battles.active(user.id).then(async snapshot => {
      if (snapshot && socket.connected) { await socket.join(snapshot.roomId); socket.emit('match_found', snapshot); }
    }).catch(() => error(socket.id, 'RECOVERY_FAILED', 'Unable to recover your battle. Please retry.'));
    socket.on('join_queue', async () => {
      if (queue.has(user.id) || pairingUsers.has(user.id) || queueIntents.has(socket.id)) return error(socket.id, 'ALREADY_QUEUED', 'This account is already searching.');
      const intent = Symbol(); queueIntents.set(socket.id, intent);
      try {
        if (await battles.active(user.id)) return error(socket.id, 'ALREADY_PLAYING', 'You already have an active battle.');
        const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, username: true, rating: true, bannedAt: true } });
        if (fresh?.bannedAt) return error(socket.id, 'ACCOUNT_BANNED', 'Account banned from competitive play. Open account standing to appeal.');
        if (!fresh || !socket.connected || queueIntents.get(socket.id) !== intent) return;
        if (pairingUsers.has(user.id) || !queue.add({ userId: fresh.id, socketId: socket.id, username: fresh.username, rating: fresh.rating, joinedAt: Date.now() })) return error(socket.id, 'ALREADY_QUEUED', 'This account is already searching.');
        socket.data.user = fresh; socket.emit('queue_status', { status: 'queued' }); void tryMatchmake();
      } catch { error(socket.id, 'QUEUE_FAILED', 'Unable to join the queue. Please retry.'); }
      finally { if (queueIntents.get(socket.id) === intent) queueIntents.delete(socket.id); }
    });
    socket.on('leave_queue', () => { queueIntents.delete(socket.id); if (pairingUsers.has(user.id)) return error(socket.id, 'MATCH_STARTING', 'Your match is starting.'); queue.remove(user.id, socket.id); socket.emit('queue_status', { status: 'idle' }); });
    socket.on('join_battle', async payload => {
      try { const snapshot = await battles.snapshot(String(payload?.roomId ?? ''), user.id); await socket.join(snapshot.roomId); socket.emit('battle_sync', snapshot); }
      catch { error(socket.id, 'NOT_PARTICIPANT', 'This battle is unavailable or belongs to other players.'); }
    });
    socket.on('forfeit_match', async payload => {
      try { const snapshot = await battles.snapshot(String(payload?.roomId ?? ''), user.id); await finish(snapshot.roomId, user.id); }
      catch { error(socket.id, 'NOT_PARTICIPANT', 'You are not a player in this battle.'); }
    });
    socket.on('test_case_update', () => error(socket.id, 'UNTRUSTED_RESULT', 'Only judged submissions can update battle results.'));
    socket.on('trigger_tiebreaker', () => error(socket.id, 'UNTRUSTED_PHASE', 'Battle phases are controlled by the server.'));
    socket.on('disconnect', () => {
      queueIntents.delete(socket.id); queue.remove(user.id, socket.id);
      void battles.active(user.id).then(snapshot => { if (snapshot && !hasSocket(user.id)) scheduleDisconnect(user.id, snapshot.roomId); }).catch(() => {});
    });
  });
  const interval = setInterval(() => { void tryMatchmake(); }, 5000); interval.unref();
  httpServer.on('close', () => { clearInterval(interval); for (const timer of disconnected.values()) clearTimeout(timer); });
  return io;
}
