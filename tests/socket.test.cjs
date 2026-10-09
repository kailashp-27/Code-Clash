const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const jwt = require('../server/node_modules/jsonwebtoken');
const { io: connect } = require('../client/node_modules/socket.io-client');

const secret = 'local-test-secret-not-used-by-the-application';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  const end = Date.now() + 4000;
  while (Date.now() < end) {
    if (check()) return;
    await delay(10);
  }
  throw new Error('Expected socket event did not arrive');
}

function database() {
  const users = new Map(['a', 'b', 'outsider'].map(id => [id, { id, username: `real-${id}`, rating: 1200, wins: 0, losses: 0, draws: 0 }]));
  const matches = new Map();
  const state = { users, matches, failCreation: false, failSave: false, commitCount: 0, transactionGate: null, lookupGate: null, lookupStarted: false };
  const prisma = {
    user: { findUnique: async ({ where }) => {
      if (state.lookupGate) { state.lookupStarted = true; await state.lookupGate; }
      return users.has(where.id) ? { ...users.get(where.id) } : null;
    } },
    problem: { upsert: async () => ({ id: 'problem', title: 'Test problem', description: 'A problem', difficulty: 'EASY' }) },
    match: {
      create: async ({ data }) => {
        if (state.failCreation) throw new Error('Simulated database create failure');
        matches.set(data.id, { ...data });
        return data;
      },
      updateMany: async ({ where, data }) => {
        const match = matches.get(where.id);
        if (!match || match.status !== where.status) return { count: 0 };
        Object.assign(match, data);
        return { count: 1 };
      },
    },
    $transaction: async action => {
      if (state.transactionGate) await state.transactionGate;
      const stagedUsers = new Map([...users].map(([id, value]) => [id, { ...value }]));
      const stagedMatches = new Map([...matches].map(([id, value]) => [id, { ...value }]));
      const committed = await action({
        match: { updateMany: async ({ where, data }) => {
          const match = stagedMatches.get(where.id);
          if (!match || match.status !== where.status) return { count: 0 };
          Object.assign(match, data);
          return { count: 1 };
        } },
        user: { update: async ({ where, data }) => {
          if (state.failSave) throw new Error('Simulated stats update failure');
          const user = stagedUsers.get(where.id);
          for (const [key, change] of Object.entries(data)) user[key] += change.increment ?? -change.decrement;
          return user;
        } },
      });
      for (const [id, value] of stagedUsers) users.set(id, value);
      for (const [id, value] of stagedMatches) matches.set(id, value);
      if (committed) state.commitCount++;
      return committed;
    },
  };
  return { prisma, state };
}

async function fixture(t, options = {}) {
  const { initSocketServer } = await import('../server/dist/socket.js');
  const { eloChanges } = await import('../server/dist/elo.js');
  const { prisma, state } = database();
  const timers = [];
  // Socket tests isolate transport/queue behavior. Real settlement and judge behavior
  // are separately tested against disposable PostgreSQL by battle.integration.test.cjs.
  const battles = {
    options: {},
    active: async userId => {
      const m = [...state.matches.values()].find(m => m.status === 'IN_PROGRESS' && (m.player1Id === userId || m.player2Id === userId));
      return m ? battles.snapshot(m.id, userId) : null;
    },
    createMatch: async (a, b) => {
      const id = require('node:crypto').randomUUID();
      await prisma.match.create({ data: { id, player1Id: a.id, player2Id: b.id, status: 'IN_PROGRESS', endTime: Date.now() + (options.matchDurationMs ?? 1800000) } });
      timers.push(setTimeout(() => { void battles.resolve(id, null, 'Time expired with equal solved counts.'); }, options.matchDurationMs ?? 1800000));
      return battles.snapshot(id, a.id);
    },
    snapshot: async (id, userId) => {
      const m = state.matches.get(id);
      if (!m || ![m.player1Id, m.player2Id].includes(userId)) throw new Error('Not a participant');
      return { roomId: id, status: m.status, phase: 'standard', endTime: m.endTime, problems: [],
        players: Object.fromEntries([m.player1Id, m.player2Id].map(id => [id, { username: state.users.get(id).username, rating: 1200 }])),
        result: m.status === 'IN_PROGRESS' ? null : { matchId: id, winnerId: m.winnerId ?? null, reason: m.reason,
          outcome: m.status === 'CANCELLED' ? 'cancelled' : !m.winnerId ? 'draw' : m.winnerId === userId ? 'win' : 'loss',
          ratingChanges: { [m.player1Id]: m.player1Change ?? 0, [m.player2Id]: m.player2Change ?? 0 } } };
    },
    resolve: async (id, winnerId, reason, cancelled = false) => {
      const m = state.matches.get(id);
      if (!m || m.status !== 'IN_PROGRESS') return false;
      if (cancelled) {
        await prisma.match.updateMany({ where: { id, status: 'IN_PROGRESS' }, data: { status: 'CANCELLED', reason } });
      } else {
        const a = state.users.get(m.player1Id), b = state.users.get(m.player2Id);
        const [da, db] = eloChanges(a.rating, b.rating, winnerId === null ? 0.5 : winnerId === a.id ? 1 : 0);
        const committed = await prisma.$transaction(async tx => {
          const claim = await tx.match.updateMany({ where: { id, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED', winnerId, reason, player1Change: da, player2Change: db } });
          if (!claim.count) return false;
          for (const [user, delta] of [[a, da], [b, db]]) await tx.user.update({ where: { id: user.id }, data: { rating: { increment: delta },
            [winnerId === null ? 'draws' : winnerId === user.id ? 'wins' : 'losses']: { increment: 1 } } });
          return true;
        });
        if (!committed) return false;
      }
      await battles.options.onUpdate?.(id);
      return true;
    },
  };
  const server = createServer();
  const io = initSocketServer(server, prisma, { jwtSecret: secret, clientOrigins: [], disconnectGraceMs: 1000, ...options, battles });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => {
    for (const timer of timers) clearTimeout(timer);
    for (const client of clients) client.socket.disconnect();
    await new Promise(resolve => io.close(resolve));
  });
  async function client(userId, token = jwt.sign({ userId }, secret)) {
    const socket = connect(url, { auth: { token }, autoConnect: false, reconnection: false, transports: ['websocket'] });
    const record = { socket, matches: [], syncs: [], errors: [], statuses: [], results: [], cancellations: [] };
    clients.push(record);
    for (const [event, property] of Object.entries({ match_found: 'matches', battle_sync: 'syncs', server_error: 'errors', queue_status: 'statuses', match_over: 'results', match_cancelled: 'cancellations' })) {
      socket.on(event, payload => record[property].push(payload));
    }
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    return record;
  }
  async function pair() {
    const a = await client('a');
    const b = await client('b');
    a.socket.emit('join_queue', { username: 'forged-name' });
    b.socket.emit('join_queue');
    await until(() => a.matches.length && b.matches.length);
    return { a, b, roomId: a.matches[0].roomId };
  }
  return { state, client, pair };
}

test('ranked sockets reject missing, invalid, expired, and nonexistent account sessions', async t => {
  const f = await fixture(t);
  for (const token of ['', 'invalid', jwt.sign({ userId: 'a' }, secret, { expiresIn: -1 }), jwt.sign({ userId: 'missing' }, secret)]) {
    await assert.rejects(f.client('a', token), /Sign in|authenticate|session|Account not found/);
  }
  assert.equal(f.state.users.size, 3);
});

test('matches use authenticated identities and ratings; another tab cannot self-match', async t => {
  const f = await fixture(t);
  const a = await f.client('a');
  const secondTab = await f.client('a');
  a.socket.emit('join_queue', { username: 'fake' });
  await until(() => a.statuses.some(value => value.status === 'queued'));
  secondTab.socket.emit('join_queue');
  await until(() => secondTab.errors.length);
  assert.equal(secondTab.errors[0].code, 'ALREADY_QUEUED');
  const b = await f.client('b');
  b.socket.emit('join_queue');
  await until(() => a.matches.length);
  assert.equal(a.matches[0].players.a.username, 'real-a');
  assert.deepEqual(Object.keys(a.matches[0].players).sort(), ['a', 'b']);
  const saved = [...f.state.matches.values()][0];
  assert.equal(saved.player1Id, 'a');
  assert.equal(saved.player2Id, 'b');
  assert.equal(f.state.users.size, 3);
});

test('a ban blocks new sockets and existing connected accounts from rejoining the queue', async t => {
  const f = await fixture(t);
  f.state.users.get('a').bannedAt = new Date();
  await assert.rejects(f.client('a'), /banned from competitive play/);
  const b = await f.client('b');
  f.state.users.get('b').bannedAt = new Date();
  b.socket.emit('join_queue');
  await until(() => b.errors.some(error => error.code === 'ACCOUNT_BANNED'));
  assert.equal(b.statuses.some(status => status.status === 'queued'), false);
  assert.equal(f.state.matches.size, 0);
});

test('cancelled queues do not match; another tab cannot cancel the queued owner', async t => {
  const f = await fixture(t);
  const a = await f.client('a');
  const otherTab = await f.client('a');
  a.socket.emit('join_queue');
  await until(() => a.statuses.length);
  otherTab.socket.emit('leave_queue');
  await until(() => otherTab.statuses.length);
  a.socket.emit('leave_queue');
  await until(() => a.statuses.some(value => value.status === 'idle'));
  const b = await f.client('b');
  b.socket.emit('join_queue');
  await until(() => b.statuses.length);
  assert.equal(f.state.matches.size, 0);
  a.socket.emit('join_queue');
  await until(() => b.matches.length);
});

test('room outsiders and client-claimed victories cannot change results or phases', async t => {
  const f = await fixture(t);
  const { a, roomId } = await f.pair();
  const outsider = await f.client('outsider');
  outsider.socket.emit('join_battle', { roomId });
  outsider.socket.emit('forfeit_match', { roomId });
  a.socket.emit('test_case_update', { roomId, passedCases: 10, totalCases: 10 });
  a.socket.emit('trigger_tiebreaker', { roomId });
  await until(() => outsider.errors.length === 2 && a.errors.length === 2);
  assert.equal(f.state.matches.get(roomId).status, 'IN_PROGRESS');
  assert.equal(f.state.commitCount, 0);
  assert.equal(outsider.syncs.length, 0);
  a.socket.emit('join_battle', { roomId });
  await until(() => a.syncs.length);
  assert.equal(a.syncs[0].endTime, a.matches[0].endTime);
  assert.equal(a.syncs[0].phase, 'standard');
});

test('forfeit saves exactly once, updates real accounts, and broadcasts only after commit', async t => {
  const f = await fixture(t);
  const { a, b, roomId } = await f.pair();
  let release;
  f.state.transactionGate = new Promise(resolve => { release = resolve; });
  a.socket.emit('forfeit_match', { roomId });
  a.socket.emit('forfeit_match', { roomId });
  await delay(40);
  assert.equal(b.results.length, 0);
  release();
  await until(() => b.results.length);
  assert.equal(f.state.commitCount, 1);
  assert.equal(f.state.users.get('a').losses, 1);
  assert.equal(f.state.users.get('b').wins, 1);
  assert.equal(f.state.users.get('b').rating, 1216);
  assert.equal(f.state.matches.get(roomId).winnerId, 'b');
  assert.equal(b.results.length, 1);
});

test('failed result transactions do not announce victory or apply partial stats', async t => {
  const f = await fixture(t);
  const { a, b, roomId } = await f.pair();
  f.state.failSave = true;
  a.socket.emit('forfeit_match', { roomId });
  await until(() => b.errors.length);
  assert.equal(b.results.length, 0);
  assert.equal(f.state.users.get('b').rating, 1200);
  assert.equal(f.state.matches.get(roomId).status, 'IN_PROGRESS');
  f.state.failSave = false;
  a.socket.emit('forfeit_match', { roomId });
  await until(() => b.results.length);
});

test('refresh recovers the same battle and deadline during disconnect grace', async t => {
  const f = await fixture(t);
  const { a, b, roomId } = await f.pair();
  const endTime = a.matches[0].endTime;
  a.socket.disconnect();
  const refreshed = await f.client('a');
  await until(() => refreshed.matches.length);
  assert.equal(refreshed.matches[0].roomId, roomId);
  assert.equal(refreshed.matches[0].endTime, endTime);
  assert.equal(b.results.length, 0);
});

test('database creation failure returns both players to idle without a phantom room', async t => {
  const f = await fixture(t);
  f.state.failCreation = true;
  const a = await f.client('a');
  const b = await f.client('b');
  a.socket.emit('join_queue');
  b.socket.emit('join_queue');
  await until(() => a.errors.length && b.errors.length);
  assert.equal(a.matches.length, 0);
  assert.equal(b.matches.length, 0);
  assert.equal(f.state.matches.size, 0);
  assert.equal(a.statuses.at(-1).status, 'idle');
});

test('equal progress at the deadline draws without awarding a win or changing equal ratings', async t => {
  const f = await fixture(t, { matchDurationMs: 80 });
  const { a, b, roomId } = await f.pair();
  await until(() => a.results.length && b.results.length);
  assert.equal(f.state.matches.get(roomId).status, 'COMPLETED');
  assert.equal(a.results[0].outcome, 'draw');
  assert.equal(f.state.users.get('a').rating, 1200);
  assert.equal(f.state.users.get('b').wins, 0);
});

test('queue cancellation wins a race with a pending account lookup', async t => {
  const f = await fixture(t);
  const a = await f.client('a');
  const b = await f.client('b');
  let release;
  f.state.lookupGate = new Promise(resolve => { release = resolve; });
  a.socket.emit('join_queue');
  await until(() => f.state.lookupStarted);
  a.socket.emit('leave_queue');
  await until(() => a.statuses.some(value => value.status === 'idle'));
  release();
  f.state.lookupGate = null;
  b.socket.emit('join_queue');
  await until(() => b.statuses.length);
  assert.equal(a.statuses.some(value => value.status === 'queued'), false);
  assert.equal(f.state.matches.size, 0);
});

test('disconnect grace expiry forfeits once to the still-connected player', async t => {
  const f = await fixture(t, { disconnectGraceMs: 80 });
  const { a, b } = await f.pair();
  a.socket.disconnect();
  await until(() => b.results.length);
  assert.equal(b.results[0].winnerId, 'b');
  assert.equal(f.state.commitCount, 1);
});

test('both disconnected players cancel instead of awarding an arbitrary winner', async t => {
  const f = await fixture(t, { disconnectGraceMs: 100 });
  const { a, b, roomId } = await f.pair();
  a.socket.disconnect();
  b.socket.disconnect();
  await until(() => f.state.matches.get(roomId).status === 'CANCELLED');
  assert.equal(f.state.commitCount, 0);
  assert.equal(f.state.users.get('a').losses, 0);
  assert.equal(f.state.users.get('b').wins, 0);
});
