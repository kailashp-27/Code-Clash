# Task 04: persisted results, chess-style Elo, and real profile statistics

Planning only, 2026-10-08. This task must not edit application code, generate/apply schema changes, run seeds, or mutate the shared database until implementation is separately assigned. Authenticated rating-based matchmaking is being implemented in the parent chat; integrate with its final contracts instead of replacing that work. Existing sample metrics stay in place during this planning task and are replaced in later implementation only when their real data source exists.

## Repository findings

- `server/src/socket.ts` currently resolves with a fixed ±25, emits `match_over` before persistence, then updates both users regardless of the conditional match update's affected-row count. Concurrent resolution can change ratings/counters twice. Disconnect deletes the user mapping before attempting a forfeit. Socket IDs and usernames currently identify participants.
- `test_case_update` trusts client counts and resolves after all cases for one problem pass; it cannot prove the whole match was won. `join_battle` fabricates a new deadline/problem list, and clients can request a boss phase. The parent's authentication/membership changes are prerequisites; retain them.
- `server/prisma/schema.prisma` has users with rating/wins/losses, one problem per match, nullable winner/loser deltas, string statuses, and no draws, result snapshots, submissions, or durable timing. `server/src/db.ts` uses PostgreSQL through Prisma's pg adapter. No deployment migrations exist yet.
- `server/src/routes/profile.ts` includes pending matches and labels every non-win a loss; it merges two separately limited lists. `winRate` alternates between a string and number.
- `client/src/pages/LiveBattlePage.tsx` simulates random verdicts, has an End (Test) control, compares usernames, and constructs fabricated duration/scores/complexity/AI feedback. `PostMatchDebrief.tsx` only supports win/loss and derives new rating locally.
- `client/src/utils/scoring.ts` has a candidate problem-scoring formula and unrelated scenario-based Elo constants. `ProfilePage.tsx` fetches some real counters but has sample streaks, solve times, boss totals, peak, chart, topic/mode metrics, tier/percentile, achievements, and passport claims. Its `rating || 1200` masks a legitimate zero.
- `/api/execute` in `server/src/index.ts` runs arbitrary stdin through Judge0; it is sandbox execution, not ranked hidden-test verification. The two `test-matchmaking.cjs` scripts are prototype smoke tests, not correctness tests.

## Decisions and prerequisites

The following are proposed version-1 rules, not claims about an already implemented game. Store `rulesVersion = ranked-v1` and `eloVersion = elo-v1-k32` so later changes do not rewrite history. Confirm consistency with the authoritative judging task before implementation.

1. Use authenticated database user IDs throughout. `roomId` remains an alias of `matchId`; socket IDs only locate connections. The match record contains two distinct users and the actual ordered problem set. No client-provided winner, score, rating, username, or test counts affect results.
2. Persist standard start/deadline and any boss start/deadline. Proposed standard duration is 60 minutes and boss duration is 45 minutes, matching current `battle_sync` intentions; the current 75-minute `match_found` mismatch must be resolved through one server configuration. Rejoins never restart clocks.
3. Permit at most one active ranked match per user across tabs/processes, enforced durably by matchmaking (for example, a unique active-participant reservation). This protects match-start rating snapshots and simplifies reconnects. Finalization releases that reservation in the same transaction.
4. Ranked verdicts require a real assigned problem set, private test cases, persisted submission receipts, and server-controlled Judge0 verification. Until this exists, simulated progress cannot settle rated victories or produce real solve metrics. Gate rated play on these prerequisites; do not retrofit fabricated results into ranked history.
5. Outcome priority is represented by durable state transitions under a match lock. The first valid terminal transition commits one immutable result. Later commands return that result; they never override it. A forfeit/disconnect command reaching the server at or after an expired phase must first advance that phase's deadline resolution.

## Outcome rules

| Trigger | Authoritative rule | Terminal state / rating |
| --- | --- | --- |
| Explicit forfeit | Authenticated participant forfeits their active match before its deadline; never accept an arbitrary loser ID | `COMPLETED`, opponent wins, normal win/loss Elo |
| Temporary disconnect | Start a persisted 30-second grace period only when the user's last authenticated connection disappears; clear it on authorized resume | No immediate outcome |
| Grace expires | If opponent is present, disconnected player loses; if both remain absent after both grace periods expire, abort | `COMPLETED` disconnect loss, or `ABORTED` mutual disconnect with zero delta |
| Standard phase ends | Compare verified standard-phase total scores after settling eligible submissions; higher total wins | `COMPLETED`, `STANDARD_SCORE` |
| Standard scores tie | Transition once to boss phase; start its clock when authoritative standard judging settles | Active boss phase, no rating update |
| Boss accepted solution | First fully accepted eligible boss submission wins, ordered by server receipt sequence, not callback arrival or client time | `COMPLETED`, `BOSS_SOLVED` |
| Boss phase ends | Compare verified boss scores; higher score wins, equal scores draw (including both zero) | `COMPLETED`, `BOSS_SCORE` or `DRAW` |
| Infrastructure prevents fair judging / invalid problem set | Retry boundedly; after the documented settlement grace abort rather than award an invented result | `ABORTED`, `JUDGE_UNAVAILABLE` / `INVALID_SETUP`, zero delta |

Standard solves contribute points and do not independently terminate a match. Do not use implementation complexity, runtime variance, or client clicks as hidden tiebreakers. Explicit simultaneous forfeits follow the serialized transition order; once completed, the second request receives the canonical result.

Accept ranked submissions only while receipt time is strictly before the persisted phase deadline. Assign an increasing receipt sequence under the match lock and persist receipt time before sending work to Judge0. At a phase deadline, close intake and drain previously admitted submissions for a proposed 30-second settlement grace. An earlier eligible boss submission still pending blocks a later accepted submission from claiming first place. Unresolved infrastructure failures at settlement expiry abort the match; genuine compile/wrong-answer verdicts are ordinary unsuccessful attempts. Timer/reconnect workers recover overdue phases and grace periods from the database after restart. Deadline, disconnect, admission, and verdict writers use the same match lock and state machine.

Port the candidate problem score to a server-owned, versioned pure function, with tests: solved base 100 (easy/medium) or 150 (hard); +20 when an easy/medium first solve is received within 15 minutes of that phase start; −10 for each judged unsuccessful ranked submission; unsolved partial credit 2 × best hidden cases passed; floor the final score at zero. Count a submission once, exclude infrastructure errors, use the best verified case count rather than summing retries, and freeze a problem after first accepted solve. Store the positive penalty magnitude and render it as a subtraction (the current debrief checks for a negative penalty incorrectly). These scoring rules affect match outcome, never Elo's K factor.

## Chess-style Elo

Start new accounts at the existing 1200. Use fixed K = 32 for both players, expected score `E1 = 1 / (1 + 10 ** ((R2 - R1) / 400))`, and actual score `S1 = 1` for player-1 victory, `0` for defeat, `0.5` for draw. Define `delta1 = sign(x) * floor(abs(x) + 0.5)` where `x = 32 * (S1 - E1)`; compute `delta2 = -delta1`, avoiding JavaScript's asymmetric negative half-rounding. Persist `before`, `delta`, and `after` for each player; never derive them from usernames or scenario labels.

- Equal 1200 ratings: win/loss = +16/−16; draw = 0/0.
- 1600 vs 1200: favorite wins +3/−3; underdog wins +29/−29; draw favorite −13, underdog +13.
- Forfeit and disconnect have the same Elo as any win/loss; no extra rating penalty. Abort does not alter Elo or W/L/D counters.
- No rating floor in v1, preserving a zero-sum transfer. Any future floor must be an explicit versioned product decision with adjusted invariants.
- Use the users' locked current ratings at settlement, and separately retain match-start rating snapshots for matchup display. With one active ranked match per user these ordinarily agree. Never overwrite a newer rating using a stale socket snapshot. Future admin rating adjustments must acquire the same user locks.

## Persistence design (later schema implementation)

Extend the existing model additively, preserving historical rows:

- `Match`: enum status (`PENDING`, `IN_PROGRESS`, `COMPLETED`, `ABORTED`), phase, ranked mode, rules/Elo versions, `startedAt`, phase deadlines, boss start, settlement state/deadline, disconnect grace deadlines, start-rating snapshots, next receipt sequence, terminal reason/outcome, nullable winner/loser, `endedAt`. An immutable result exists for both completed and aborted states.
- `MatchProblem`: `(matchId, problemId, phase, ordinal)` plus frozen title/difficulty/test-set version and case count; retain the existing `problemId` for compatibility until migration of consumers is complete. Referenced judging data must be immutable/versioned for the match's lifetime.
- `Submission`: ID, match/user/problem/phase, unique `(matchId, userId, requestId)`, payload hash, receipt sequence/time, judge job token(s), status, verified counts, infrastructure error, judged time. A repeated request with changed code/language is a conflict, not a new attempt; never expose hidden case contents in result APIs.
- `MatchPlayerResult`: unique `(matchId, userId)`, side, username snapshot, outcome (`WIN`, `LOSS`, `DRAW`, `ABORTED`), rating before/delta/after, total score. Per-problem result rows carry status, best counts, incorrect-attempt count, first solve time/receipt, phase-relative solve duration, and score components. Fields lacking evidence remain null, not fabricated zero measurements.
- `User`: add `draws` (default zero), rating-history baseline timestamp/value, and peak rating if cached. Wins/losses/draws are transactional caches; immutable player results are the reconciliation source for post-cutover matches.
- `ResultOutbox`: unique event key `match:<id>:result:v1`, result reference, created/delivered time, attempt/lease metadata. Add indexes for pending outbox rows, overdue active matches, participant result history, and submissions by phase/sequence. Terminal checks require two player results, opposing wins/losses or paired draws/aborts, a participant winner/loser when decisive, and zero-sum deltas.

### Atomic finalizer and exactly-once effects

Create a dedicated service (proposed `server/src/services/matchResults.ts`) called by every outcome path. Its internal input is a match ID and a trusted trigger/evidence reference; external users cannot invoke it with a claimed outcome.

1. Open an interactive PostgreSQL transaction. Lock the match row using a parameterized `SELECT ... FOR UPDATE`. Read participants and persisted authoritative evidence inside the transaction. All judging/state writers take this lock first; no network calls or Socket.IO emits occur inside it.
2. If already terminal, read/return the two immutable results without any updates. Validate trigger, participant membership, phase, deadlines, and eligibility. Resolve a terminal outcome only from trusted persisted state.
3. Lock the two user rows individually in ascending user-ID order to avoid deadlocks when users are shared across operations. Read their current ratings; calculate Elo and counter changes once. Match and user lock order must be consistent in every mutator.
4. Update the match with `WHERE id = ... AND status = 'IN_PROGRESS'` and assert exactly one row changed. If it does not, throw and roll back; never continue to user increments after a failed transition claim. Write both unique player results and per-problem summaries, update both users/counters/peak, release both active-match reservations, and insert the unique result-outbox event in this transaction.
5. Commit. Only now clear local timers/maps, acknowledge the initiating command, and attempt result delivery. Retry transient deadlock/serialization errors up to three times with jitter using the same match/evidence IDs. On failure keep the match retryable, emit a typed retryable error, and do not report a victory that was not committed.
6. A durable outbox dispatcher claims pending events with leases, emits the canonical result to authorized participant rooms, and marks delivered after emit. A crash between emit and marking delivered may repeat delivery. Clients deduplicate by `resultId`; REST/resume recover missed results. Exactly-once applies to committed ratings/counters/result creation, not to transport delivery, which is at least once.

Use `(matchId, userId)` as the durable result identity (for example, a deterministic `resultId` string), and the match ID as finalization's idempotency key. An in-memory `resolving` flag may reduce duplicate work but cannot enforce correctness across processes/restarts. Do not keep the current array transaction, where a zero-row `updateMany` can still commit user increments. Separate command acknowledgements from outbox dispatch so delivery failures cannot roll back or repeat rating application.

## Event and API contracts

Keep the parent's JWT socket authentication and membership checks. Align shared event types in `client/src/socket/events.ts` and server equivalents; remove `any` result/state payloads during implementation. Every command has an acknowledgement `{ ok: true, ... }` or `{ ok: false, error: { code, message, retryable } }`; stable codes include `UNAUTHORIZED`, `NOT_PARTICIPANT`, `MATCH_NOT_FOUND`, `MATCH_NOT_ACTIVE`, `PHASE_CLOSED`, `REQUEST_CONFLICT`, and `PERSISTENCE_UNAVAILABLE`.

- `match_found` and `battle_sync`: canonical `matchId`/compatible `roomId`, status/phase, persisted start/deadline, server time, version, actual assigned problems, and `{ userId, username, ratingAtStart }[]`. `battle_sync` includes the viewer's persisted result when terminal. Only participants can join/resume; user identity comes from verified socket context.
- `join_battle({ roomId })`: authorize, join, then return/emit the persisted state or canonical result. Never manufacture a new match or deadline.
- `forfeit_match({ roomId, requestId })`: infer actor from auth; acknowledge only after committed settlement, returning that actor's canonical result. Repeated commands return the same result. Leave waits for acknowledgement/recovery rather than immediately hiding a failed forfeit.
- `test_case_update` and `trigger_tiebreaker`: remove as sources of ranked state; the server publishes verified progress and phase transitions. Any retained demo usage is explicitly unrated and isolated.
- Judging dependency: proposed `POST /api/matches/:matchId/submissions` with JWT and `{ requestId, problemId, languageId, sourceCode }` returns 202 plus persisted submission ID/receipt sequence, or its prior receipt on replay. Trusted judge completion is an internal service call keyed by submission ID; duplicate callbacks are harmless. Sandbox Run is distinct from ranked Submit.
- `opponent_test_update`: `{ matchId, userId, problemId, verifiedPassedCases, totalCases, stateVersion }`, produced from persisted verdicts. A progress event cannot itself alter Elo.
- `match_over`: send each participant a viewer-specific `MatchResultV1` after commit, with the same content returned by REST below. Match ID filters prevent stale-room events from overwriting a newer battle.
- `GET /api/matches/:matchId/result`: JWT participant-only read, 200 terminal result; 202 `{ matchId, status, phase, deadlineAt }` while active; 401 invalid authentication, 403 nonparticipant, 404 missing match. No side-effectful resolution via this GET.

Proposed canonical result shape (ISO UTC timestamps; ratings/points are integers; durations are milliseconds):

```ts
type MatchResultV1 = {
  schemaVersion: 1;
  resultId: string; // matchId:userId, immutable after terminal commit
  matchId: string;
  mode: 'ranked';
  status: 'COMPLETED' | 'ABORTED';
  outcome: 'WIN' | 'LOSS' | 'DRAW' | 'ABORTED'; // viewer perspective
  reason: 'FORFEIT' | 'DISCONNECT' | 'STANDARD_SCORE' | 'BOSS_SOLVED'
    | 'BOSS_SCORE' | 'DRAW' | 'MUTUAL_DISCONNECT' | 'JUDGE_UNAVAILABLE' | 'INVALID_SETUP';
  rulesVersion: string;
  eloVersion: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  reachedBoss: boolean;
  me: PlayerResult;
  opponent: PlayerResult;
  analysis: null; // reserve for a separately persisted, evidence-backed feature
};
type PlayerResult = {
  userId: string;
  username: string;
  ratingBefore: number;
  ratingChange: number;
  ratingAfter: number;
  totalScore: number | null;
  problems: {
    problemId: string;
    title: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    phase: 'standard' | 'boss';
    status: 'SOLVED' | 'ATTEMPTED' | 'DNF' | 'UNAVAILABLE';
    solveDurationMs: number | null;
    passedCases: number | null;
    totalCases: number;
    wrongSubmissions: number | null;
    score: { total: number; baseScore: number; speedBonus: number;
      penalty: number; partialCredit: number } | null;
  }[];
};
```

## Profile contract and real-data replacement

Keep authenticated `GET /api/profile`. Return one consistent snapshot using a read transaction with repeatable-read isolation when querying caches plus history. Proposed version-1 fields: `user { id, username, joinedAt }`, numeric `rating`, `wins`, `losses`, `draws`, `totalBattles = W + L + D`, numeric `winRate` rounded to one decimal (`100 * W / totalBattles`, zero for no rated completions), `abortedBattles`, `currentStreak { outcome, count }`, `bestWinStreak`, `peakRating { value, achievedAt }`, nullable `averageSolveDurationMs`/`fastestSolveDurationMs`, `boss { seen, solved }`, `ratingHistory`, and `recentMatches`.

- Query unified participant results ordered by `endedAt DESC, matchId DESC`, limited to ten; include match ID, opponent ID/name, explicit outcome/reason, mode, before/delta/after, and ended time. Pending matches are excluded. Aborted entries can appear with an explicit label but do not count as losses or rated battles.
- Win/loss streaks use completed rated results in settlement order; a draw resets a decisive streak, abort does not. Solve averages use first verified solves of distinct match problems; no accepted solves means null. Boss seen counts only problems actually activated; solved counts verified first solves. Mark partial-history metrics with `historySince`.
- Rating history uses immutable post-cutover result snapshots plus an explicitly labeled baseline, ordered by settlement. Empty/one-point charts need valid layout; do not invent monthly interpolation. Derive post-cutover peak from the baseline and snapshots, with its real time.
- Once this real response is wired, replace supported sample chart/counters/debrief measurements in the same implementation slice. Preserve visual structure. Zero values are legitimate; use null checks, not `|| 1200`. Draw and aborted displays get neutral styling, independent of positive/negative Elo (a draw can change rating).
- Joined date comes from `User.createdAt`. Topic statistics require problem tags and verified attempts; achievements require a rule catalogue; tiers/percentiles require an agreed tier table/population query; passport/AI/complexity claims require their own evidence. Keep the existing samples during planning. In later implementation, replace each unsupported sample only when that feature has a real data contract (including explicit null/unavailable), displaying unavailable/empty content instead of treating sample text as earned facts. Do not make an API failure silently fall back to samples.
- `LiveBattlePage` owns canonical result/loading/retry state, recovers via result GET on mount/reconnect, deduplicates `resultId`, and refreshes profile/session rating after completion. `PostMatchDebrief` accepts the result model rather than many fabricated props and renders server `ratingAfter`, real duration/score rows, draw/abort reasons, and optional analysis only when evidence exists. Remove ranked test-ending controls/random verdicts only with the authoritative flow replacement.

## Migration and implementation order

1. Re-read the parent's authenticated matchmaking changes. Agree user-ID payloads, active reservations, phase timing, and authoritative judging receipt/result contracts. Introduce pure rules/Elo service and typed contracts first.
2. Prepare a reviewed additive PostgreSQL migration and regenerate Prisma later; no `db push`, reset, or seeds in this planning task. Preserve existing accounts, matches, and counters. Establish each account's cutover rating/counter baseline; legacy guest/demo matches remain marked legacy/unverified and excluded from verified statistics. Do not fabricate missing ratings, verdicts, draws, or solve times from old winner/loser fields, or recompute historical ±25 as Elo. Legacy history may be shown separately with unknown metrics.
3. Implement durable match problems/submission evidence and judging dependency. Add database constraints/indexes and the transactional finalizer, deadline/reconnect recovery, and outbox. Replace all existing fixed-rating resolution paths with this service. A reconciliation job compares baseline plus new immutable results against cached counters/ratings without applying result effects again.
4. Add result/profile reads and canonical socket payloads; integrate the debrief and refresh path. Replace each sample metric only alongside real backing data or an explicit unavailable state. Persisted result delivery must work when the battle listener misses the initial socket emit.
5. Run the checks below against an isolated disposable test database. Update README's prototype limitations only after capabilities are actually verified. Do not run guest-producing smoke scripts against the shared development database.

## Required verification and acceptance criteria

- Pure Elo tests: equal/different ratings, favorite/underdog wins, draws, symmetric half rounding, zero-sum integer deltas, rating zero/negative, deterministic versioned output, and no scenario/forfeit multiplier.
- Pure scoring tests: 15-minute boundary, phase-relative time, base/bonus/partial-credit interaction, nonnegative score, repeated wrong verdict idempotency, first accepted freeze, and infrastructure failures excluded from penalties.
- Real PostgreSQL integration tests (mocks cannot prove locking): 20 concurrent identical resolution calls cause exactly one terminal match, two player results, one outbox record, one counter/rating effect per player. Race forfeit vs verdict vs timeout vs disconnect, plus two different finalizers/processes. Every replay reads the same committed result.
- Inject failure after match claim, after first user update, and before outbox insert: all writes/reservations roll back and no `match_over` is emitted. Retry succeeds once. Check deadlock retry exhaustion yields a recoverable error without partial settlement. Test separate matches sharing a user via fixture/admin path to prove sorted user locks prevent lost rating updates.
- Submission races: duplicate request/callback, changed replay payload, out-of-order boss callbacks, receipt exactly at cutoff, pre-cutoff pending verdict, settlement timeout, forged progress/phase commands, invalid problem/user IDs, and unknown/inconsistent case counts. Only trusted eligible verdicts can award a scored win.
- Lifecycle tests: reconnect within grace, old socket disconnect after a replacement socket connects, multiple tabs, both users absent, deadline crossed during grace, restarts with overdue active phases/outbox, and duplicate worker timers. No fresh deadline or accidental forfeit on successful resume.
- Delivery tests: result sent only after commit; simulate crash after commit before emit and after emit before outbox acknowledgement. Replay can repeat notifications but never ratings. HTTP/rejoin returns the exact same viewer result when original event was missed. Nonparticipants cannot read/join/forfeit another match.
- Profile fixtures: player-1/player-2 wins and losses, unequal-rating draw, abort, pending, zero matches, legacy baseline, more than ten mixed-side results, equal ended timestamps, real zero rating, no solves, actual peak/chart/streak metrics, and a concurrent settlement during profile read. No pending match appears as loss; counters/history are consistent.
- UI flow: two authenticated users complete/forfeit a real match, both see correct identity/outcome/before/delta/after, reload results, and observe matching refreshed profile counters/history. Verify neutral draw/abort treatment, negative draw delta, zero delta, fetch failure/retry, and no fabricated AI/complexity/score claims after their replacement slice ships.
- Run `npm --prefix server run typecheck`, `npm run check`, and the added isolated result integration suite. Record which checks actually ran and which require Judge0/database fixtures. Acceptance is atomic exactly-once database effects, server-authoritative outcomes, recoverable canonical results, and statistics supported by persisted evidence.
