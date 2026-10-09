const test = require('node:test');
const assert = require('node:assert/strict');

const entry = (id, rating, joinedAt = 0) => ({ userId: id, socketId: `socket-${id}`, username: id, rating, joinedAt });

test('rating windows widen with waiting time, remain bounded, and require both players to qualify', async () => {
  const { RankedQueue, ratingWindow } = await import('../server/dist/matchmaking.js');
  assert.equal(ratingWindow(0, 0), 100);
  assert.equal(ratingWindow(0, 15000), 150);
  assert.equal(ratingWindow(0, 90000), 400);
  assert.equal(ratingWindow(0, 9999999), 400);
  const queue = new RankedQueue();
  queue.add(entry('a', 1200));
  queue.add(entry('b', 1500, 60000));
  assert.equal(queue.takePair(60000), null); // New opponent's window is still 100.
  assert.deepEqual(queue.takePair(120000).map(player => player.userId), ['a', 'b']);
});

test('queue prefers the closest eligible opponent and prevents self-pairing across tabs', async () => {
  const { RankedQueue } = await import('../server/dist/matchmaking.js');
  const queue = new RankedQueue();
  assert.equal(queue.add(entry('a', 1200)), true);
  assert.equal(queue.add({ ...entry('a', 1200), socketId: 'second-tab' }), false);
  queue.add(entry('b', 1290, 1));
  queue.add(entry('c', 1210, 2));
  assert.deepEqual(queue.takePair(10).map(player => player.userId), ['a', 'c']);
  assert.equal(queue.takePair(10), null);
  assert.equal(queue.remove('b', 'wrong-tab'), false);
  assert.equal(queue.remove('b', 'socket-b'), true);
});
