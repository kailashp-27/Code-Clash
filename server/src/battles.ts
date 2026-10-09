import { Prisma, type PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { eloChanges } from './elo.js';
import { compareOutput, languageIds, publicProblem, seedProblems, type ProblemSnapshot } from './problems.js';
import { analyzeIntegrity } from './integrity.js';

export class BattleError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const participant = (m: { player1Id: string; player2Id: string }, id: string) => m.player1Id === id || m.player2Id === id;
const ongoing = (status: string) => status === 'IN_PROGRESS' || status === 'DRAINING';
const summarySelect = { id: true, problemId: true, mode: true, state: true, verdict: true, passed: true, total: true,
  time: true, memory: true, receivedAt: true, finishedAt: true, integrity: true } as const;
const matchInclude = { player1: { select: { id: true, username: true, rating: true } },
  player2: { select: { id: true, username: true, rating: true } }, assignments: { orderBy: { slot: 'asc' as const } },
  submissions: { where: { mode: 'SUBMIT', verdict: 'ACCEPTED' }, orderBy: { sequence: 'asc' as const } } };
type FullMatch = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;
interface CaseResult { index: number; token?: string; verdict?: string; stdout?: string; stderr?: string; time?: number; memory?: number }
interface Options { judge0Url: string; matchDurationMs?: number; onUpdate?: (matchId: string) => void | Promise<void> }

export class BattleService {
  private timer: ReturnType<typeof setInterval> | undefined;
  private workers = 0;
  private stopped = false;
  constructor(public prisma: PrismaClient, public options: Options) {}

  private async transaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(action, { isolationLevel: 'Serializable', timeout: 15000 }); }
      catch (error) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
  }
  private notify(id: string) { Promise.resolve(this.options.onUpdate?.(id)).catch(e => console.error('[battle] Notification failed', e.message)); }
  async createMatch(first: { id: string; username: string; rating: number }, second: { id: string; username: string; rating: number }) {
    if (first.id === second.id) throw new BattleError(409, 'A player cannot battle themselves.');
    await seedProblems(this.prisma);
    const problems = await this.prisma.problem.findMany({ where: { shortCode: { in: ['CC-TWO-SUM-V1', 'CC-BRACKETS-V1'] } }, orderBy: { shortCode: 'desc' } });
    if (problems.length !== 2 || problems.some(p => !p.tests || !p.starters)) throw new BattleError(503, 'Problem bank is unavailable.');
    const match = await this.transaction(async tx => {
      // ActivePlayer's unique user key protects duplicate joins across processes.
      const ids = [first.id, second.id].sort();
      for (const id of ids) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      const users = await tx.user.findMany({ where: { id: { in: ids } } });
      const a = users.find(u => u.id === first.id), b = users.find(u => u.id === second.id);
      if (!a || !b) throw new BattleError(404, 'Account unavailable.');
      if (a.bannedAt || b.bannedAt) throw new BattleError(403, 'A banned account cannot enter a battle.');
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() as now`;
      const now = clock!.now;
      return tx.match.create({ data: { problemId: problems[0]!.id, player1Id: first.id, player2Id: second.id,
        player1RatingBefore: a.rating, player2RatingBefore: b.rating, status: 'IN_PROGRESS', startedAt: now,
        deadlineAt: new Date(now.getTime() + (this.options.matchDurationMs ?? 30 * 60000)),
        activePlayers: { create: ids.map(userId => ({ userId })) },
        assignments: { create: problems.map((p, slot) => ({ problemId: p.id, slot, snapshot: json({ id: p.id,
          title: p.title, description: p.description, difficulty: p.difficulty, topic: p.topic, tests: p.tests, starters: p.starters, version: p.version }) })) } } });
    });
    return this.snapshot(match.id, first.id);
  }
  async active(userId: string) {
    const active = await this.prisma.activePlayer.findUnique({ where: { userId } });
    return active ? this.snapshot(active.matchId, userId) : null;
  }
  private progress(match: FullMatch, userId: string) {
    const firsts = new Map<string, typeof match.submissions[number]>();
    for (const s of match.submissions) if (s.userId === userId && (!match.endedAt || (s.finishedAt && s.finishedAt <= match.endedAt)) && !firsts.has(s.problemId)) firsts.set(s.problemId, s);
    const accepted = [...firsts.values()];
    return { solved: accepted.length, problemIds: [...firsts.keys()],
      completionSequence: accepted.length === match.assignments.length && accepted.length > 0 ? Math.max(...accepted.map(s => s.sequence)) : null,
      solveSeconds: accepted.length && match.startedAt ? Math.max(0, (Math.max(...accepted.map(s => s.receivedAt.getTime())) - match.startedAt.getTime()) / 1000) : null };
  }
  async snapshot(matchId: string, userId: string) {
    const m = await this.prisma.match.findUnique({ where: { id: matchId }, include: matchInclude });
    if (!m || !participant(m, userId)) throw new BattleError(404, 'Battle not found.');
    const a = this.progress(m, m.player1Id), b = this.progress(m, m.player2Id);
    const players = { [m.player1Id]: { username: m.player1.username, rating: m.player1RatingBefore ?? m.player1.rating },
      [m.player2Id]: { username: m.player2.username, rating: m.player2RatingBefore ?? m.player2.rating } };
    const result = !ongoing(m.status) ? { matchId: m.id, winnerId: m.winnerId, reason: m.reason ?? 'Historical result',
      outcome: m.status === 'CANCELLED' ? 'cancelled' : m.winnerId === null ? 'draw' : m.winnerId === userId ? 'win' : 'loss',
      ratingChanges: { [m.player1Id]: m.player1Change ?? (m.winnerId === m.player1Id ? m.winnerRatingChange : m.loserRatingChange) ?? 0,
        [m.player2Id]: m.player2Change ?? (m.winnerId === m.player2Id ? m.winnerRatingChange : m.loserRatingChange) ?? 0 },
      ratingsBefore: { [m.player1Id]: m.player1RatingBefore, [m.player2Id]: m.player2RatingBefore },
      ratingsAfter: { [m.player1Id]: m.player1RatingAfter, [m.player2Id]: m.player2RatingAfter },
      players: { [m.player1Id]: { username: m.player1.username, solved: a.solved, solveSeconds: a.solveSeconds },
        [m.player2Id]: { username: m.player2.username, solved: b.solved, solveSeconds: b.solveSeconds } } } : null;
    return { roomId: m.id, endTime: m.deadlineAt?.getTime() ?? m.createdAt.getTime(), phase: 'standard' as const, status: m.status,
      players, problems: m.assignments.map(p => publicProblem(p.snapshot as unknown as ProblemSnapshot)),
      progress: { [m.player1Id]: { solved: a.solved, problemIds: a.problemIds }, [m.player2Id]: { solved: b.solved, problemIds: b.problemIds } },
      submissions: await this.prisma.submission.findMany({ where: { matchId, userId }, select: summarySelect, orderBy: { receivedAt: 'desc' }, take: 50 }), result };
  }
  async submit(matchId: string, userId: string, body: unknown, mode: 'RUN' | 'SUBMIT') {
    if (!body || typeof body !== 'object') throw new BattleError(400, 'Invalid submission.');
    const data = body as Record<string, unknown>;
    const { problemId, language, sourceCode, requestId } = data;
    if (Object.keys(data).some(k => !['problemId', 'language', 'sourceCode', 'requestId'].includes(k)) ||
      typeof problemId !== 'string' || typeof language !== 'string' || !Object.hasOwn(languageIds, language) ||
      typeof sourceCode !== 'string' || !sourceCode.trim() || Buffer.byteLength(sourceCode) > 65536 ||
      typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      throw new BattleError(400, 'Use a supported language, a request UUID, and 1–65536 bytes of source.');
    }
    const sourceHash = createHash('sha256').update(sourceCode).digest('hex');
    return this.transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
      if (!user || user.bannedAt) throw new BattleError(403, 'Account restricted from submissions. Check account standing.');
      await tx.$queryRaw`SELECT id FROM matches WHERE id = ${matchId} FOR UPDATE`;
      const match = await tx.match.findUnique({ where: { id: matchId }, include: { assignments: true } });
      if (!match || !participant(match, userId)) throw new BattleError(404, 'Battle not found.');
      const previous = await tx.submission.findUnique({ where: { userId_matchId_requestId: { userId, matchId, requestId } } });
      if (previous) {
        if (previous.sourceHash !== sourceHash || previous.problemId !== problemId || previous.language !== language || previous.mode !== mode) throw new BattleError(409, 'Request ID already used for different content.');
        return { id: previous.id, state: previous.state };
      }
      const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() as now`;
      const now = clock!.now;
      if (match.status !== 'IN_PROGRESS' || !match.deadlineAt || now >= match.deadlineAt) throw new BattleError(409, 'This battle no longer accepts submissions.');
      const assignment = match.assignments.find(p => p.problemId === problemId);
      if (!assignment) throw new BattleError(400, 'Problem is not assigned to this battle.');
      const busy = await tx.submission.count({ where: { userId, state: { in: ['QUEUED', 'RUNNING'] } } });
      const recent = await tx.submission.count({ where: { userId, receivedAt: { gt: new Date(now.getTime() - 60000) } } });
      const pending = await tx.submission.count({ where: { state: { in: ['QUEUED', 'RUNNING'] } } });
      if (busy || recent >= 6 || pending >= 100) throw new BattleError(429, 'Please wait for your current run or submission; limit is six requests per minute.');
      const snapshot = assignment.snapshot as unknown as ProblemSnapshot;
      const tests = mode === 'RUN' ? snapshot.tests.filter(t => !t.hidden) : snapshot.tests;
      const updated = await tx.match.update({ where: { id: matchId }, data: { sequence: { increment: 1 } } });
      const submission = await tx.submission.create({ data: { userId, matchId, assignmentId: assignment.id, problemId, language,
        sourceCode, sourceHash, requestId, mode, sequence: updated.sequence, receivedAt: now, total: tests.length } });
      return { id: submission.id, state: submission.state };
    });
  }
  async submission(id: string, userId: string) {
    const s = await this.prisma.submission.findUnique({ where: { id }, include: { assignment: true } });
    if (!s || s.userId !== userId) throw new BattleError(404, 'Submission not found.');
    const tests = (s.assignment.snapshot as unknown as ProblemSnapshot).tests;
    const visible = s.mode === 'RUN' ? tests.filter(t => !t.hidden) : tests;
    const cases = s.cases as unknown as CaseResult[];
    return { id: s.id, problemId: s.problemId, mode: s.mode, state: s.state, verdict: s.verdict, passed: s.passed, total: s.total,
      time: s.time, memory: s.memory, receivedAt: s.receivedAt, finishedAt: s.finishedAt, compileOutput: s.compileOutput,
      sourceCode: s.sourceCode, language: s.language,
      examples: cases.filter(c => visible[c.index]?.hidden === false).map(c => ({ verdict: c.verdict ?? 'PENDING', stdout: c.stdout ?? '', stderr: c.stderr ?? '' })),
      integrity: s.integrity };
  }
  async resolve(matchId: string, winnerId: string | null, reason: string, cancelled = false) {
    const changed = await this.transaction(async tx => {
      const pre = await tx.match.findUnique({ where: { id: matchId } });
      if (!pre) return false;
      // Every path uses the same user→match lock order, preventing deadlocks with submit.
      for (const id of [pre.player1Id, pre.player2Id].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM matches WHERE id = ${matchId} FOR UPDATE`;
      const m = await tx.match.findUnique({ where: { id: matchId } });
      if (!m || !ongoing(m.status)) return false;
      let finalWinner = winnerId, finalReason = reason, finalCancelled = cancelled;
      if (reason === 'ADJUDICATE') {
        // Read progress while holding the same settlement lock. An earlier snapshot
        // must never award a draw while a judge commits a newly accepted solution.
        const assignments = await tx.matchProblem.count({ where: { matchId } });
        const submissions = await tx.submission.findMany({ where: { matchId, mode: 'SUBMIT' }, orderBy: { sequence: 'asc' } });
        const solved = (id: string) => {
          const first = new Map<string, number>();
          for (const s of submissions) if (s.userId === id && s.verdict === 'ACCEPTED' && !first.has(s.problemId)) first.set(s.problemId, s.sequence);
          return { count: first.size, sequence: assignments > 0 && first.size === assignments ? Math.max(...first.values()) : null };
        };
        const a = solved(m.player1Id), b = solved(m.player2Id);
        const candidates = [{ id: m.player1Id, sequence: a.sequence }, { id: m.player2Id, sequence: b.sequence }]
          .filter((p): p is { id: string; sequence: number } => p.sequence !== null).sort((x, y) => x.sequence - y.sequence);
        const candidate = candidates[0];
        const eligible = candidate ? submissions.filter(s => s.sequence <= candidate.sequence) : submissions;
        const pending = eligible.some(s => s.state !== 'FINISHED');
        const infra = eligible.some(s => s.verdict === 'JUDGE_ERROR');
        if (candidate && !pending) {
          finalWinner = candidate.id; finalCancelled = infra;
          finalReason = infra ? 'Judging unavailable; ratings unchanged.' : 'First to solve both problems.';
        } else if (m.status === 'DRAINING' && !pending) {
          finalWinner = a.count === b.count ? null : a.count > b.count ? m.player1Id : m.player2Id;
          finalCancelled = infra;
          finalReason = infra ? 'Judging unavailable; ratings unchanged.' : a.count === b.count ? 'Time expired with equal solved counts.' : 'Time expired; more problems solved.';
        } else if (m.status === 'DRAINING' && m.drainUntil && Date.now() >= m.drainUntil.getTime()) {
          finalWinner = null; finalCancelled = true; finalReason = 'Judge timeout; ratings unchanged.';
        } else return false;
      }
      if (finalWinner !== null && !participant(m, finalWinner)) throw new BattleError(400, 'Invalid winner.');
      const users = await tx.user.findMany({ where: { id: { in: [m.player1Id, m.player2Id] } } });
      const a = users.find(u => u.id === m.player1Id)!, b = users.find(u => u.id === m.player2Id)!;
      const [da, db] = finalCancelled ? [0, 0] : eloChanges(a.rating, b.rating, finalWinner === null ? 0.5 : finalWinner === a.id ? 1 : 0);
      const loserId = finalWinner === null ? null : finalWinner === a.id ? b.id : a.id;
      await tx.match.update({ where: { id: matchId }, data: { status: finalCancelled ? 'CANCELLED' : 'COMPLETED', winnerId: finalCancelled ? null : finalWinner,
        loserId: finalCancelled ? null : loserId, reason: finalReason, endedAt: new Date(), player1RatingBefore: a.rating, player2RatingBefore: b.rating,
        player1RatingAfter: a.rating + da, player2RatingAfter: b.rating + db, player1Change: da, player2Change: db,
        winnerRatingChange: finalWinner === a.id ? da : finalWinner === b.id ? db : null,
        loserRatingChange: loserId === a.id ? da : loserId === b.id ? db : null } });
      if (!finalCancelled) for (const [u, delta] of [[a, da], [b, db]] as const) {
        await tx.user.update({ where: { id: u.id }, data: { rating: { increment: delta },
          ...(finalWinner === null ? { draws: { increment: 1 } } : finalWinner === u.id ? { wins: { increment: 1 } } : { losses: { increment: 1 } }) } });
      }
      await tx.activePlayer.deleteMany({ where: { matchId } });
      return true;
    });
    if (changed) this.notify(matchId);
    return changed;
  }
  async evaluate(matchId: string) {
    await this.resolve(matchId, null, 'ADJUDICATE');
  }
  async sweep() {
    const expired = await this.prisma.match.findMany({ where: { status: 'IN_PROGRESS', deadlineAt: { lte: new Date() } }, select: { id: true } });
    for (const m of expired) await this.prisma.match.updateMany({ where: { id: m.id, status: 'IN_PROGRESS' }, data: { status: 'DRAINING', drainUntil: new Date(Date.now() + 240000) } });
    // Legacy active placeholders predate durable deadlines. Cancel safely rather than invent scores.
    const legacy = await this.prisma.match.findMany({ where: { status: 'IN_PROGRESS', deadlineAt: null }, select: { id: true } });
    for (const m of legacy) await this.resolve(m.id, null, 'Legacy battle has no durable deadline.', true);
    const active = await this.prisma.match.findMany({ where: { status: { in: ['IN_PROGRESS', 'DRAINING'] } }, select: { id: true } });
    for (const m of active) await this.evaluate(m.id);
  }
  async work() {
    const owner = randomUUID();
    const s = await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM submissions
        WHERE state = 'QUEUED' OR (state = 'RUNNING' AND "leaseUntil" < NOW())
        ORDER BY "receivedAt", sequence FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.submission.update({ where: { id: rows[0].id }, data: { state: 'RUNNING', leaseOwner: owner,
        leaseUntil: new Date(Date.now() + 180000), attempts: { increment: 1 } }, include: { assignment: true } });
    });
    if (!s) return false;
    const save = async (data: Prisma.SubmissionUpdateManyMutationInput) => {
      const updated = await this.prisma.submission.updateMany({ where: { id: s.id, leaseOwner: owner, state: 'RUNNING' }, data });
      if (!updated.count) throw new Error('Worker lease lost');
    };
    try {
      const snapshot = s.assignment.snapshot as unknown as ProblemSnapshot;
      const tests = s.mode === 'RUN' ? snapshot.tests.filter(t => !t.hidden) : snapshot.tests;
      const cases = s.cases as unknown as CaseResult[];
      const deadline = Date.now() + 150000;
      let compileOutput = s.compileOutput;
      for (let index = 0; index < tests.length; index++) {
        if (this.stopped) throw new Error('Worker stopping');
        if (Date.now() >= deadline) throw new Error('Judging budget exceeded');
        let item = cases.find(c => c.index === index);
        if (item?.verdict) continue;
        if (!item) { item = { index }; cases.push(item); }
        const fixture = tests[index]!;
        if (!item.token) {
          const response = await fetch(`${this.options.judge0Url}/submissions?base64_encoded=true&wait=false`, { method: 'POST',
            signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_code: Buffer.from(s.sourceCode).toString('base64'), language_id: languageIds[s.language],
              stdin: Buffer.from(fixture.stdin).toString('base64'), cpu_time_limit: s.language === 'cpp' ? 2 : 4,
              wall_time_limit: 10, memory_limit: 512000, max_file_size: 64, enable_network: false, number_of_runs: 1 }) });
          if (!response.ok) throw new Error('Judge0 submission unavailable');
          const payload = await response.json() as { token?: string };
          if (typeof payload.token !== 'string' || !/^[\w-]{1,128}$/.test(payload.token)) throw new Error('Invalid judge token');
          item.token = payload.token;
          await save({ cases: json(cases), leaseUntil: new Date(Date.now() + 180000) });
        }
        let result: { status?: { id: number }; stdout?: string; stderr?: string; compile_output?: string; time?: string; memory?: number } | undefined;
        while (Date.now() < deadline) {
          if (this.stopped) throw new Error('Worker stopping');
          const response = await fetch(`${this.options.judge0Url}/submissions/${item.token}?base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory`, { signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error('Judge0 polling unavailable');
          result = await response.json();
          if (result?.status && result.status.id > 2) break;
          await new Promise(resolve => setTimeout(resolve, 350));
        }
        const status = result?.status?.id;
        if (!status || status < 3 || status === 13 || status === 14) throw new Error('Judge0 could not execute this case');
        const decode = (value: string | undefined) => value ? Buffer.from(value, 'base64').toString('utf8').slice(0, 65536) : '';
        const stdout = decode(result?.stdout), stderr = decode(result?.stderr);
        item.verdict = status === 3 ? compareOutput(stdout, fixture.stdout) ? 'ACCEPTED' : 'WRONG_ANSWER' :
          status === 5 ? 'TIME_LIMIT_EXCEEDED' : status === 6 ? 'COMPILATION_ERROR' : status >= 7 && status <= 12 ? 'RUNTIME_ERROR' : 'JUDGE_ERROR';
        if (item.verdict === 'JUDGE_ERROR') throw new Error('Unexpected judge status');
        // Hidden outputs may echo private stdin. Never store them in the public diagnostics.
        if (!fixture.hidden) { item.stdout = stdout; item.stderr = stderr; }
        item.time = Number(result?.time) || 0; item.memory = result?.memory ?? 0;
        if (item.verdict === 'COMPILATION_ERROR') compileOutput = decode(result?.compile_output).slice(0, 8192);
        await save({ cases: json(cases), compileOutput, leaseUntil: new Date(Date.now() + 180000) });
        if (item.verdict === 'COMPILATION_ERROR') break;
      }
      const passed = cases.filter(c => c.verdict === 'ACCEPTED').length;
      const verdict = passed === tests.length ? 'ACCEPTED' : cases.find(c => c.verdict !== 'ACCEPTED')?.verdict ?? 'JUDGE_ERROR';
      let integrity: unknown = null;
      if (s.mode === 'SUBMIT') {
        const peers = await this.prisma.submission.findMany({ where: { problemId: s.problemId, language: s.language,
          userId: { not: s.userId }, mode: 'SUBMIT', state: 'FINISHED' }, select: { id: true, userId: true, sourceCode: true }, orderBy: { receivedAt: 'desc' }, take: 30 });
        integrity = analyzeIntegrity(s.sourceCode, peers, s.userId);
      }
      await save({ state: 'FINISHED', verdict, passed, time: Math.max(0, ...cases.map(c => c.time ?? 0)),
        memory: Math.max(0, ...cases.map(c => c.memory ?? 0)), finishedAt: new Date(), compileOutput,
        ...(integrity ? { integrity: json(integrity) } : {}), leaseOwner: null, leaseUntil: null });
    } catch (error) {
      // Retry infrastructure failures only. Stored tokens and completed cases resume after restart.
      const exhausted = s.attempts >= 2;
      await this.prisma.submission.updateMany({ where: { id: s.id, leaseOwner: owner, state: 'RUNNING' },
        data: { state: exhausted ? 'FINISHED' : 'QUEUED', verdict: exhausted ? 'JUDGE_ERROR' : null,
          finishedAt: exhausted ? new Date() : null, leaseOwner: null, leaseUntil: null } });
      console.error('[judge] Infrastructure failure:', error instanceof Error ? error.message : 'unknown');
    }
    await this.evaluate(s.matchId);
    this.notify(s.matchId);
    return true;
  }
  start() {
    this.stopped = false;
    let sweeping = false;
    this.timer = setInterval(() => {
      if (this.workers < 2) { this.workers++; void this.work().catch(e => console.error('[judge]', e.message)).finally(() => this.workers--); }
      if (!sweeping) { sweeping = true; void this.sweep().catch(e => console.error('[battle]', e.message)).finally(() => { sweeping = false; }); }
    }, 1000);
    this.timer.unref();
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); }
}
