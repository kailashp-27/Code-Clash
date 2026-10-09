// Opt in with CODECLASH_INTEGRATION=1. Every write goes to a newly created database.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createServer } = require('node:http');
const runFile = promisify(execFile);
const serverDirectory = path.resolve(__dirname, '../server');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function disposableDatabase(t) {
  const dotenv = require('../server/node_modules/dotenv');
  const pg = require('../server/node_modules/pg');
  dotenv.config({ path: path.join(serverDirectory, '.env'), quiet: true });
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must identify an accessible PostgreSQL server');
  const originalUrl = new URL(process.env.DATABASE_URL);
  const name = `codeclash_integration_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, /^codeclash_integration_[a-f0-9]{32}$/);
  const adminUrl = new URL(originalUrl);
  adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.href });
  let created = false;
  let prisma;
  let pool;
  t.after(async () => {
    try {
      if (prisma) await prisma.$disconnect();
      if (pool) await pool.end();
      if (created) {
        // A generated, validated literal only; never the configured application DB.
        assert.match(name, /^codeclash_integration_[a-f0-9]{32}$/);
        assert.notEqual(name, decodeURIComponent(originalUrl.pathname.slice(1)));
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      }
    } finally {
      await admin.end();
    }
  });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const isolatedUrl = new URL(originalUrl);
  isolatedUrl.pathname = `/${name}`;
  await runFile(process.execPath, [path.join(serverDirectory, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: serverDirectory,
    env: { ...process.env, DATABASE_URL: isolatedUrl.href },
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const { PrismaClient } = require('../server/node_modules/@prisma/client');
  const { PrismaPg } = require('../server/node_modules/@prisma/adapter-pg');
  pool = new pg.Pool({ connectionString: isolatedUrl.href });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await prisma.$connect();
  return prisma;
}

async function fakeJudge(t) {
  const calls = [];
  const jobs = new Map();
  const controls = { hold: false, fail: false };
  const server = createServer(async (req, res) => {
    try {
      if (controls.fail) { res.writeHead(503).end(); return; }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/languages') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify([{ id: 63, name: 'JavaScript (Node.js)' }, { id: 71, name: 'Python (3)' }, { id: 54, name: 'C++ (GCC)' }, { id: 62, name: 'Java (OpenJDK)' }]));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/submissions') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const encoded = url.searchParams.get('base64_encoded') === 'true';
        const decode = value => encoded ? Buffer.from(value || '', 'base64').toString('utf8') : value || '';
        const source = decode(body.source_code);
        const stdin = decode(body.stdin);
        calls.push({ body, source, stdin });
        const token = randomUUID();
        let stdout = 'definitely-wrong-output';
        if (source.includes('CORRECT_SUM')) {
          const numbers = stdin.trim().split(/\s+/).map(Number);
          stdout = String(numbers.reduce((sum, value) => sum + value, 0));
        }
        if (source.includes('CORRECT_TWO_SUM')) {
          const [count, target, ...numbers] = stdin.trim().split(/\s+/).map(Number);
          const seen = new Map();
          for (let index = 0; index < count; index++) {
            if (seen.has(target - numbers[index])) { stdout = `${seen.get(target - numbers[index])} ${index}`; break; }
            seen.set(numbers[index], index);
          }
        }
        if (source.includes('CORRECT_PARENTHESES')) {
          const stack = [];
          const partners = { ')': '(', ']': '[', '}': '{' };
          let valid = true;
          for (const character of stdin.trim()) {
            if ('([{'.includes(character)) stack.push(character);
            else if (stack.pop() !== partners[character]) { valid = false; break; }
          }
          stdout = String(valid && stack.length === 0);
        }
        if (source.includes('ECHO_PRIVATE_INPUT')) stdout = stdin;
        const result = { token, status: { id: 3, description: 'Accepted' }, stdout, stderr: null, compile_output: null, time: '0.001', memory: 1024 };
        jobs.set(token, { ...result, held: source.includes('HOLD_JUDGE_RESULT') });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(url.searchParams.get('wait') === 'true' ? result : { token }));
        return;
      }
      const token = url.pathname.split('/').at(-1);
      const result = jobs.get(token);
      if (result) {
        const encoded = url.searchParams.get('base64_encoded') === 'true';
        const payload = controls.hold && result.held ? { token, status: { id: 2, description: 'Processing' } } : { ...result, stdout: encoded ? Buffer.from(result.stdout).toString('base64') : result.stdout };
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404).end();
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { url: `http://127.0.0.1:${server.address().port}`, calls, controls };
}

async function players(prisma) {
  const suffix = randomUUID();
  return Promise.all(['first', 'second', 'outsider'].map(role => prisma.user.create({
    data: { username: `${role}-${suffix}`, email: `${role}-${suffix}@integration.invalid`, password: 'isolated-fixture-never-for-login', rating: 1200 },
  })));
}

test('persistent battles against isolated PostgreSQL and fake Judge0', {
  skip: process.env.CODECLASH_INTEGRATION !== '1' ? 'Set CODECLASH_INTEGRATION=1 to create a disposable PostgreSQL test database' : false,
  timeout: 180000,
}, async t => {
  const prisma = await disposableDatabase(t);
  const judge = await fakeJudge(t);
  const { BattleService } = await import('../server/dist/battles.js');
  const { seedProblems } = await import('../server/dist/problems.js');
  await seedProblems(prisma);
  const service = new BattleService(prisma, { judge0Url: judge.url, matchDurationMs: 600000 });
  t.after(() => service.stop());

  async function fixture() {
    const [first, second, outsider] = await players(prisma);
    const snapshot = await service.createMatch(first, second);
    return { first, second, outsider, snapshot, matchId: snapshot.roomId };
  }
  function body(problemId, sourceCode, requestId = randomUUID()) {
    return { problemId, language: 'javascript', sourceCode, requestId };
  }
  async function finishWork(id, worker = service) {
    for (let attempt = 0; attempt < 20; attempt++) {
      await worker.work();
      const row = await prisma.submission.findUniqueOrThrow({ where: { id } });
      if (row.state === 'FINISHED') return row;
      await delay(10);
    }
    assert.fail('The durable submission did not finish after worker polling');
  }

  await t.test('only participants see battle state; active assignment and deadlines survive reload', async () => {
    const f = await fixture();
    const reloaded = await service.snapshot(f.matchId, f.first.id);
    assert.equal(reloaded.endTime, f.snapshot.endTime);
    assert.deepEqual(reloaded.problems, f.snapshot.problems);
    assert.equal((await service.active(f.first.id)).roomId, f.matchId);
    await assert.rejects(() => service.snapshot(f.matchId, f.outsider.id));
    await assert.rejects(() => service.createMatch(f.first, f.outsider));
    await assert.rejects(() => service.submit(f.matchId, f.outsider.id, body(f.snapshot.problems[0].id, 'wrong'), 'SUBMIT'));
    await service.resolve(f.matchId, null, 'TEST_CANCEL', true);
    assert.equal(await service.active(f.first.id), null);
  });

  await t.test('concurrent competing settlements award exactly one Elo result and one win/loss', async () => {
    const f = await fixture();
    const outcomes = await Promise.allSettled([
      service.resolve(f.matchId, f.first.id, 'FORFEIT'),
      service.resolve(f.matchId, f.second.id, 'FORFEIT'),
      service.resolve(f.matchId, f.first.id, 'FORFEIT'),
    ]);
    assert.ok(outcomes.some(result => result.status === 'fulfilled'));
    const match = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    const current = await prisma.user.findMany({ where: { id: { in: [f.first.id, f.second.id] } } });
    assert.equal(match.status, 'COMPLETED');
    assert.equal(current.reduce((sum, user) => sum + user.wins, 0), 1);
    assert.equal(current.reduce((sum, user) => sum + user.losses, 0), 1);
    assert.equal(current.reduce((sum, user) => sum + user.rating, 0), 2400);
    assert.ok(current.every(user => user.rating !== 1200));
    const ratings = current.map(user => [user.id, user.rating, user.wins, user.losses]);
    await service.resolve(f.matchId, f.first.id, 'FORFEIT');
    const repeated = await prisma.user.findMany({ where: { id: { in: [f.first.id, f.second.id] } } });
    assert.deepEqual(repeated.map(user => [user.id, user.rating, user.wins, user.losses]), ratings);
    assert.equal(await prisma.activePlayer.count({ where: { matchId: f.matchId } }), 0);
  });

  await t.test('draws and cancelled games preserve equal-player ratings and record different statistics', async () => {
    const drawn = await fixture();
    await service.resolve(drawn.matchId, null, 'TIMEOUT_DRAW');
    const drawUsers = await prisma.user.findMany({ where: { id: { in: [drawn.first.id, drawn.second.id] } } });
    assert.ok(drawUsers.every(user => user.rating === 1200 && user.draws === 1 && user.wins === 0 && user.losses === 0));
    const cancelled = await fixture();
    await service.resolve(cancelled.matchId, null, 'JUDGE_UNAVAILABLE', true);
    const cancelUsers = await prisma.user.findMany({ where: { id: { in: [cancelled.first.id, cancelled.second.id] } } });
    assert.ok(cancelUsers.every(user => user.rating === 1200 && user.draws === 0 && user.wins === 0 && user.losses === 0));
    assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: cancelled.matchId } })).status, 'CANCELLED');
  });

  await t.test('official submissions deduplicate retries and reject conflicting payloads', async () => {
    const f = await fixture();
    const request = body(f.snapshot.problems[0].id, 'wrong');
    const first = await service.submit(f.matchId, f.first.id, request, 'SUBMIT');
    const retry = await service.submit(f.matchId, f.first.id, request, 'SUBMIT');
    assert.equal(first.id, retry.id);
    assert.equal(await prisma.submission.count({ where: { matchId: f.matchId } }), 1);
    await assert.rejects(() => service.submit(f.matchId, f.first.id, { ...request, sourceCode: 'different' }, 'SUBMIT'));
    await assert.rejects(() => service.submit(f.matchId, f.first.id, body(randomUUID(), 'wrong'), 'SUBMIT'));
    await assert.rejects(() => service.submission(first.id, f.second.id));
    await service.resolve(f.matchId, null, 'TEST_CANCEL', true);
  });

  await t.test('sample runs do not solve problems; only server comparison accepts an official solution', async () => {
    const f = await fixture();
    const problem = f.snapshot.problems.find(row => row.title === 'Two Sum');
    assert.ok(problem, 'The authored Two Sum problem is assigned');
    const run = await service.submit(f.matchId, f.first.id, body(problem.id, '// CORRECT_TWO_SUM'), 'RUN');
    const runRow = await finishWork(run.id);
    assert.equal(runRow.verdict, 'ACCEPTED');
    assert.equal((await service.snapshot(f.matchId, f.first.id)).progress[f.first.id].solved, 0);
    const wrong = await service.submit(f.matchId, f.first.id, body(problem.id, '// WRONG_ANSWER'), 'SUBMIT');
    const wrongRow = await finishWork(wrong.id);
    assert.notEqual(wrongRow.verdict, 'ACCEPTED', 'Judge0 execution success alone is not a valid solution');
    const accepted = await service.submit(f.matchId, f.first.id, body(problem.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
    const acceptedRow = await finishWork(accepted.id);
    assert.equal(acceptedRow.verdict, 'ACCEPTED');
    assert.equal(acceptedRow.passed, acceptedRow.total);
    const updated = await service.snapshot(f.matchId, f.first.id);
    assert.equal(updated.progress[f.first.id].solved, 1);
    assert.equal(updated.status, 'IN_PROGRESS', 'Solving one of two problems does not finish the battle');
    await service.resolve(f.matchId, null, 'TEST_CANCEL', true);
  });

  await t.test('public battle and official verdict DTOs omit private fixtures, output and peer source', async () => {
    const f = await fixture();
    assert.ok(f.snapshot.problems.every(problem => !Object.hasOwn(problem, 'tests')));
    const problem = f.snapshot.problems[0];
    const submitted = await service.submit(f.matchId, f.first.id, body(problem.id, '// ECHO_PRIVATE_INPUT UNIQUE_OWNER_SOURCE'), 'SUBMIT');
    await finishWork(submitted.id);
    const detail = await service.submission(submitted.id, f.first.id);
    assert.ok(detail.examples.length <= problem.examples.length, 'Only public-example output may be exposed');
    for (const example of detail.examples) {
      assert.ok(problem.examples.some(visible => visible.stdin === example.stdout), 'Echoed diagnostics belong to a published example');
    }
    assert.equal(Object.hasOwn(detail, 'cases'), false);
    assert.equal(detail.sourceCode, '// ECHO_PRIVATE_INPUT UNIQUE_OWNER_SOURCE', 'Owners can review their saved source');
    await assert.rejects(service.submission(submitted.id, f.second.id), e => e.status === 404, 'Opponents cannot retrieve owner source');
    const otherSnapshot = await service.snapshot(f.matchId, f.second.id);
    assert.equal(JSON.stringify(otherSnapshot).includes('UNIQUE_OWNER_SOURCE'), false);
    assert.equal(otherSnapshot.submissions.some(row => row.id === submitted.id), false);
    await service.resolve(f.matchId, null, 'TEST_CANCEL', true);
  });

  await t.test('queued judging work survives BattleService recreation', async () => {
    const f = await fixture();
    const problem = f.snapshot.problems.find(row => row.title === 'Two Sum');
    const submitted = await service.submit(f.matchId, f.first.id, body(problem.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
    const recovered = new BattleService(prisma, { judge0Url: judge.url, matchDurationMs: 600000 });
    try {
      const restored = await recovered.snapshot(f.matchId, f.first.id);
      assert.equal(restored.endTime, f.snapshot.endTime);
      assert.equal((await finishWork(submitted.id, recovered)).verdict, 'ACCEPTED');
      assert.equal((await recovered.snapshot(f.matchId, f.first.id)).progress[f.first.id].solved, 1);
    } finally {
      recovered.stop();
    }
    await service.resolve(f.matchId, null, 'TEST_CANCEL', true);
  });

  await t.test('deadline closes new submissions and drains work accepted before the deadline', async () => {
    const f = await fixture();
    const problem = f.snapshot.problems.find(row => row.title === 'Two Sum');
    const submitted = await service.submit(f.matchId, f.first.id, body(problem.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
    await prisma.match.update({ where: { id: f.matchId }, data: { deadlineAt: new Date(Date.now() - 1) } });
    await service.sweep();
    assert.equal((await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } })).status, 'DRAINING');
    await assert.rejects(() => service.submit(f.matchId, f.second.id, body(problem.id, '// CORRECT_TWO_SUM'), 'SUBMIT'));
    await finishWork(submitted.id);
    await service.sweep();
    const match = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    assert.equal(match.status, 'COMPLETED');
    assert.equal(match.winnerId, f.first.id);
    const result = await service.snapshot(f.matchId, f.first.id);
    assert.equal(result.result.outcome, 'win');
    assert.ok(result.result.ratingChanges[f.first.id] > 0);
  });

  await t.test('first receipt wins even when a later finishing submission is judged first', async () => {
    const f = await fixture();
    const sum = f.snapshot.problems.find(row => row.title === 'Two Sum');
    const brackets = f.snapshot.problems.find(row => row.title === 'Balanced Brackets');
    for (const user of [f.first, f.second]) {
      const submitted = await service.submit(f.matchId, user.id, body(sum.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
      await finishWork(submitted.id);
    }
    const earlier = await service.submit(f.matchId, f.first.id, body(brackets.id, '// CORRECT_PARENTHESES HOLD_JUDGE_RESULT'), 'SUBMIT');
    const later = await service.submit(f.matchId, f.second.id, body(brackets.id, '// CORRECT_PARENTHESES'), 'SUBMIT');
    const before = await prisma.submission.findUniqueOrThrow({ where: { id: earlier.id } });
    const after = await prisma.submission.findUniqueOrThrow({ where: { id: later.id } });
    assert.ok(before.sequence < after.sequence);
    judge.controls.hold = true;
    const pendingWorker = service.work();
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        const row = await prisma.submission.findUniqueOrThrow({ where: { id: earlier.id } });
        if (row.state === 'RUNNING') break;
        await delay(10);
      }
      const otherWorker = new BattleService(prisma, { judge0Url: judge.url });
      try {
        assert.equal((await finishWork(later.id, otherWorker)).verdict, 'ACCEPTED');
      } finally { otherWorker.stop(); }
      const unresolved = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
      assert.equal(unresolved.status, 'IN_PROGRESS', 'A later verdict cannot bypass an earlier eligible submission');
      judge.controls.hold = false;
      await pendingWorker;
      const settled = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
      assert.equal(settled.status, 'COMPLETED');
      assert.equal(settled.winnerId, f.first.id);
    } finally {
      judge.controls.hold = false;
      await pendingWorker;
    }
  });

  await t.test('judge infrastructure errors retry and then cancel without rating penalties', async () => {
    const f = await fixture();
    const submitted = await service.submit(f.matchId, f.first.id, body(f.snapshot.problems[0].id, '// WRONG_ANSWER'), 'SUBMIT');
    judge.controls.fail = true;
    try {
      await service.work();
      const retried = await prisma.submission.findUniqueOrThrow({ where: { id: submitted.id } });
      assert.equal(retried.state, 'QUEUED');
      assert.equal(retried.verdict, null);
      await service.work();
      const exhausted = await prisma.submission.findUniqueOrThrow({ where: { id: submitted.id } });
      assert.equal(exhausted.state, 'FINISHED');
      assert.equal(exhausted.verdict, 'JUDGE_ERROR');
    } finally { judge.controls.fail = false; }
    await prisma.match.update({ where: { id: f.matchId }, data: { deadlineAt: new Date(Date.now() - 1) } });
    await service.sweep();
    const match = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    assert.equal(match.status, 'CANCELLED');
    const current = await prisma.user.findMany({ where: { id: { in: [f.first.id, f.second.id] } } });
    assert.ok(current.every(user => user.rating === 1200 && user.wins === 0 && user.losses === 0 && user.draws === 0));
  });

  await t.test('expired drain cancels unresolved official work without manufacturing a result', async () => {
    const f = await fixture();
    await service.submit(f.matchId, f.first.id, body(f.snapshot.problems[0].id, '// WRONG_ANSWER'), 'SUBMIT');
    await prisma.match.update({ where: { id: f.matchId }, data: { status: 'DRAINING', deadlineAt: new Date(Date.now() - 5000), drainUntil: new Date(Date.now() - 1) } });
    await service.sweep();
    const match = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    assert.equal(match.status, 'CANCELLED');
    assert.equal(match.winnerId, null);
    assert.equal(match.player1Change, 0);
    assert.equal(match.player2Change, 0);
  });

  await t.test('deadline adjudication waits for pending verdicts and settles from fresh progress', async () => {
    const f = await fixture();
    const problem = f.snapshot.problems.find(row => row.title === 'Two Sum');
    const submitted = await service.submit(f.matchId, f.first.id, body(problem.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
    await prisma.match.update({ where: { id: f.matchId }, data: { status: 'DRAINING', deadlineAt: new Date(Date.now() - 1), drainUntil: new Date(Date.now() + 60000) } });
    const stale = await service.snapshot(f.matchId, f.first.id);
    assert.equal(stale.progress[f.first.id].solved, 0);
    await Promise.all([service.evaluate(f.matchId), service.sweep()]);
    const pending = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    assert.equal(pending.status, 'DRAINING', 'Zero solved counts are not enough to draw while an official verdict is pending');
    const unawarded = await prisma.user.findUniqueOrThrow({ where: { id: f.first.id } });
    assert.equal(unawarded.rating, 1200);
    assert.equal(unawarded.draws, 0);
    await finishWork(submitted.id);
    await Promise.all([service.evaluate(f.matchId), service.sweep()]);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: f.matchId } });
    assert.equal(match.status, 'COMPLETED');
    assert.equal(match.winnerId, f.first.id, 'Fresh adjudication includes the committed acceptance despite the earlier zero-solve snapshot');
    const winner = await prisma.user.findUniqueOrThrow({ where: { id: f.first.id } });
    assert.equal(winner.wins, 1);
    assert.equal(winner.draws, 0);
  });

  await t.test('reports require independent review; distinct confirmed cases ban and appeals restore access', async () => {
    const { ModerationService } = await import('../server/dist/moderation.js');
    const f = await fixture();
    const moderation = new ModerationService(prisma, [f.outsider.id, f.first.id]);
    const problem = f.snapshot.problems[0];
    const reports = [];
    const evidence = 'Observed prohibited assistance with supporting test evidence, pending independent review.';
    let matchId = f.matchId;
    for (let index = 0; index < 2; index++) {
      const problems = index === 0 ? f.snapshot.problems : (await service.snapshot(matchId, f.first.id)).problems;
      const submissions = [];
      for (const p of index === 0 ? problems : problems.slice(0, 1)) {
        const s = await service.submit(matchId, f.second.id, body(p.id, '// WRONG_ANSWER'), 'SUBMIT');
        await finishWork(s.id); submissions.push(s);
      }
      if (index === 0) {
        const duplicateProblem = await service.submit(matchId, f.second.id, body(problems[0].id, '// WRONG_ANSWER'), 'SUBMIT');
        await finishWork(duplicateProblem.id); submissions.push(duplicateProblem);
      }
      await assert.rejects(moderation.report(f.first.id, { submissionId: submissions[0].id, category: 'SUSPECTED_AI', details: evidence }), e => e.status === 409);
      await service.resolve(matchId, null, 'TEST_REPORT_DRAW');
      for (const s of submissions) {
        const saved = await moderation.report(f.first.id, { submissionId: s.id, category: 'SUSPECTED_AI', details: evidence });
        reports.push(saved);
        assert.deepEqual(await moderation.report(f.first.id, { submissionId: s.id, category: 'SUSPECTED_AI', details: evidence }), saved, 'Duplicate report is idempotent');
        await assert.rejects(moderation.report(f.outsider.id, { submissionId: s.id, category: 'COPYING', details: evidence }), e => e.status === 404);
        await assert.rejects(moderation.report(f.second.id, { submissionId: s.id, category: 'COPYING', details: evidence }), e => e.status === 404);
      }
      const targets = await moderation.targets(matchId, f.first.id);
      assert.ok(targets.every(s => !('sourceCode' in s) && !('integrity' in s)), 'Reporter cannot read opponent source or local advisory');
      if (index === 0) matchId = (await service.createMatch(f.first, f.second)).roomId;
    }
    assert.equal(reports.length, 4);
    assert.equal((await moderation.standing(f.second.id)).strikes, 0, 'Unreviewed reports cannot punish an account');
    await assert.rejects(moderation.list(f.second.id), e => e.status === 403);
    await assert.rejects(moderation.review(f.first.id, reports[0].id, 'CONFIRMED', evidence), e => e.status === 403, 'Reporter cannot confirm their own accusation');
    const active = await service.createMatch(f.first, f.second);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: f.second.id } });
    await Promise.all(reports.map(report => moderation.review(f.outsider.id, report.id, 'CONFIRMED', 'Controlled fixture evidence confirms the prohibited assistance for this distinct battle problem.')));
    const standing = await moderation.standing(f.second.id);
    assert.equal(standing.strikes, 3); assert.equal(standing.banned, true);
    assert.equal((await service.snapshot(active.roomId, f.first.id)).status, 'CANCELLED');
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.second.id } })).rating, before.rating);
    await assert.rejects(service.createMatch(f.first, f.second), e => e.status === 403);
    await assert.rejects(service.submit(active.roomId, f.second.id, body(problem.id, '// WRONG_ANSWER'), 'SUBMIT'), e => e.status === 403);
    await moderation.review(f.outsider.id, reports[0].id, 'CONFIRMED', evidence);
    assert.equal((await moderation.standing(f.second.id)).strikes, 3, 'Repeated moderator decisions do not duplicate strikes');
    const uniqueCase = reports.at(-1);
    await moderation.appeal(f.second.id, uniqueCase.id, 'This controlled appeal includes new independent evidence supporting reversal.');
    assert.ok((await moderation.list(f.outsider.id)).find(row => row.id === uniqueCase.id).appeal);
    await assert.rejects(moderation.appeal(f.first.id, uniqueCase.id, evidence), e => e.status === 404);
    const reversed = await moderation.review(f.outsider.id, uniqueCase.id, 'DISMISSED', 'New evidence clears this finding after the account holder appealed.');
    assert.equal(reversed.strikes, 2); assert.equal(reversed.banned, false);
    const restored = await service.createMatch(f.first, f.second);
    await service.resolve(restored.roomId, null, 'TEST_CLEANUP', true);
  });

  await t.test('profile achievements and topic statistics come from completed judged battles', async () => {
    const { getProfile } = await import('../server/dist/profile-data.js');
    const f = await fixture();
    const empty = await getProfile(prisma, f.first.id);
    assert.equal(empty.totalBattles, 0);
    assert.equal(empty.solvedProblems, 0);
    assert.equal(empty.averageSolveSeconds, null);
    assert.deepEqual(empty.ratingHistory, []);
    assert.ok(empty.achievements.every(badge => badge.unlocked === false));
    assert.equal(await getProfile(prisma, randomUUID()), null);
    const sum = f.snapshot.problems.find(row => row.title === 'Two Sum');
    const brackets = f.snapshot.problems.find(row => row.title === 'Balanced Brackets');
    const first = await service.submit(f.matchId, f.first.id, body(sum.id, '// CORRECT_TWO_SUM'), 'SUBMIT');
    await finishWork(first.id);
    assert.equal((await getProfile(prisma, f.first.id)).solvedProblems, 0, 'Unfinished battle performance is not awarded as a completed achievement');
    const second = await service.submit(f.matchId, f.first.id, body(brackets.id, '// CORRECT_PARENTHESES'), 'SUBMIT');
    await finishWork(second.id);
    const actual = await getProfile(prisma, f.first.id);
    assert.equal(actual.totalBattles, 1);
    assert.equal(actual.wins, 1);
    assert.equal(actual.losses, 0);
    assert.equal(actual.draws, 0);
    assert.equal(actual.solvedProblems, 2);
    assert.equal(actual.acceptedSubmissions, 2);
    assert.ok(actual.averageSolveSeconds >= 0);
    assert.equal(actual.recentMatches[0].id, f.matchId);
    assert.equal(actual.recentMatches[0].outcome, 'win');
    assert.equal(actual.ratingHistory[0].rating, actual.rating);
    assert.deepEqual(actual.topics.map(topic => [topic.name, topic.solved]).sort(), [['Arrays', 1], ['Stacks', 1]]);
    assert.ok(['first-battle', 'first-win', 'first-solve'].every(id => actual.achievements.find(badge => badge.id === id)?.unlocked));
    assert.equal(actual.achievements.find(badge => badge.id === 'ten-battles').unlocked, false);
    const persisted = await getProfile(prisma, f.first.id);
    assert.deepEqual(persisted.achievements, actual.achievements, 'Refreshing a profile preserves achievement unlock timestamps');
    assert.equal(await prisma.userAchievement.count({ where: { userId: f.first.id } }), 3);
    const cancelled = await service.createMatch(f.first, f.outsider);
    await service.resolve(cancelled.roomId, null, 'TEST_CANCEL', true);
    assert.equal((await getProfile(prisma, f.first.id)).totalBattles, 1);
  });
});
