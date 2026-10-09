# 02 — Persisted, server-owned battle judging

Status: implementation plan only. Repository read on 2026-10-08. No application code, schema, database, or infrastructure changes are included in this task.

## Outcome and boundaries

Two authenticated users receive the same immutable problem set, edit a complete program in a supported language, run visible examples, and submit against server-private tests. The application server persists every submission, obtains execution results from Judge0, compares output itself, updates progress, and resolves the battle exactly once. A browser can never supply verdicts, expected outputs, test counts, points, deadlines, or winners.

The parent chat is replacing guest matchmaking with authenticated, rating-based matchmaking in this same checkout. Implement the stages below after reconciling its final contracts; do not overwrite its socket/authentication/rating changes. The initial release uses two standard problems and a deterministic draw rule. A boss round and the prototype speed/partial-credit scoring are a later extension, not prerequisites for a working battle.

## Current repository evidence

| Area | Current behavior and integration point |
| --- | --- |
| `server/prisma/schema.prisma` | `Problem` has only metadata; `Match` links one problem and two users. No tests, submissions, problem versions, persisted deadlines, or judge jobs. |
| `server/prisma/seed.ts` | Seeds an account only; no real problem bank. |
| `server/src/socket.ts` | Creates guests and a placeholder problem, emits inconsistent mock problem sets, accepts `test_case_update`, and lets the browser trigger a boss round. These observations precede the parent's matchmaking replacement. |
| `server/src/index.ts` | `/api/execute` forwards arbitrary code/language/stdin synchronously and exposes execution output; `/api/languages` returns the entire Judge0 catalog. Neither is a battle-submission contract. |
| `client/src/pages/LiveBattlePage.tsx` | Run generates random passed counts; Submit has no action; a timer button simulates results; debrief data is hard-coded. Language options include TypeScript without a verified runtime contract. |
| `client/src/components/Sandbox.tsx` | Working standalone execution UI with six hard-coded language IDs; reuse editor/input patterns, not its untrusted execution verdict for battle scoring. |
| `client/src/socket/events.ts` | Mock problem DTO and client-owned progress/tiebreak events need replacement after the parent work lands. |
| `client/src/utils/scoring.ts` | Client scoring and scenario-based rating deltas are not authoritative. Use the parent's server rating service. |
| Existing test scripts | Matchmaking scripts are unauthenticated smoke scripts; `test-judge0.js` only checks one execution. There is no battle correctness suite in default checks. |

## Contracts to agree with authenticated matchmaking

1. JWT verification supplies `userId` for both HTTP and socket connections. Identity never comes from a request body, username, or socket ID. Reuse the parent's verifier and user-room convention.
2. `matchId` is the persisted match ID and room ID. Matchmaking selects and persists the entire ordered problem set before emitting `match_found`. A selection/database failure must not create a playable mock match.
3. Persist `startedAt`, `deadlineAt`, participant IDs, and a rules version. Reconnect returns these same values and the same public problem versions; it cannot reset the timer or assignment.
4. All finishes, including judging, deadline, authenticated forfeit, and the parent's disconnect policy, call one transactional resolver. It conditionally transitions an active match and writes the result and rating updates in the same transaction. Emit `match_over` only after commit. Duplicate/reordered events cannot update ratings twice.
5. The resolver must support a draw and an infrastructure-aborted match. Draw rating handling follows the parent's Elo policy; an infrastructure abort makes no rating/win/loss change. Do not force a loser into a draw DTO.

## Data model and migration

Use additive Prisma migrations, checked into version control. Current scripts use `db:push` and have no deployment migration history: establish a baseline for an existing database before deploying new migrations, and rehearse on a disposable database. Do not reset existing users, matches, or volumes.

| Proposed entity | Required fields and constraints |
| --- | --- |
| `Problem` | Stable ID and unique short code; retain legacy metadata for compatibility. |
| `ProblemVersion` | Problem ID, version number, title, statement, difficulty enum, constraints, input/output format, comparator version, published flag, checksum, timestamps. Unique `(problemId, version)`. Published versions are immutable. |
| `TestCase` | Version ID, ordinal, `EXAMPLE`/`HIDDEN`, stdin, expected stdout, optional visible explanation. Unique `(versionId, ordinal)`; deterministic ordering. No user-facing hidden-test query. |
| `ProblemLanguage` | Version ID, stable language key, starter source, runtime-profile version; unique `(versionId, languageKey)`. |
| `MatchProblem` | Match ID, version ID, slot, phase; unique `(matchId, slot)` and `(matchId, versionId)`. Retain the old required `Match.problemId` during transition by assigning the first problem; remove only in a later compatibility migration. |
| `Submission` | ID, user ID, match-problem ID, mode `RUN`/`SUBMIT`, source, source SHA-256, language/profile snapshot, rules version, client request ID, server receipt timestamp, per-match monotonic sequence, state, aggregate verdict, passed/total counts, finished timestamp. Unique `(userId, matchId, clientRequestId)`; index `(matchId, userId, receivedAt)`. |
| `SubmissionCase` | Submission ID, private test ID, state/verdict, Judge0 token, attempt, metrics, private bounded diagnostics. Unique `(submissionId, testCaseId)`. Tokens and test IDs never enter public DTOs. |
| `JudgeJob` | Submission ID unique, state, available time, lease expiry, attempt count, last sanitized infrastructure error. PostgreSQL-backed queue; claim with row locking/skip-locked and a fencing generation. |
| `MatchPlayerProblem` | Match-problem ID, user ID, first accepted submission ID and receipt sequence/time. Unique `(matchProblemId, userId)`. Solved progress is monotonic. |
| `Match` additions | Persisted start/deadline, `ACTIVE`/`DRAINING`/`COMPLETED`/`ABORTED` lifecycle mapped to parent's status enum, result reason, resolution version. Existing completed historical matches need no fabricated test results. |

Enforce participant and assignment relationships transactionally; a submission cannot refer to a version outside its match. Keep private fixtures under `server/problems/`, outside `client/public` and frontend imports. Public serializers select explicit fields rather than spreading Prisma records. Production logs and error reporting must exclude source, private inputs/answers, raw Judge0 payloads, and tokens. Keep source accessible only to its owner; establish a retention limit before deployment.

## Problem bank and language contracts

Seed a small authored bank via a dedicated idempotent problem seed command, separate from account seeding. Start with two published versions; add more only after fixture validation. Reject publication if examples/hidden tests/language starters/reference solutions are missing or checksums conflict with an existing published version. Match selection fails closed if too few eligible versions exist. All players receive identical versions and limits.

Use complete single-file programs with stdin/stdout, not function-signature wrappers. One Judge0 execution receives one case; no test-count prefix. Publish constraints, exact grammar, at least two examples and their explanations, and a ready-to-edit starter for every allowed language. UTF-8 input, LF lines, optional final newline. Integer values stay within signed 32-bit input and JavaScript-safe output ranges; use 64-bit accumulators where sums can exceed 32-bit.

| Initial problem | Exact format and visible examples | Private test coverage |
| --- | --- | --- |
| Two Sum, easy | Line 1: `n target`; line 2: `n` integers. `2 <= n <= 100000`; values and target in `[-1000000,1000000]`; exactly one valid unordered pair. Print zero-based `i j` with `i < j`. Example `4 9\n2 7 11 15\n` → `0 1\n`; `3 6\n3 3 8\n` → `0 1\n`. | Minimum length, equal values, zero/negative target, negative values, pair at end, distracting duplicate values with exactly one valid pair, large input catching quadratic solutions. Validate uniqueness during authoring. |
| Valid Parentheses, medium | One line containing only `(){}[]`, length `0..100000`; blank line represents empty string. Print exactly `true` or `false`. Examples `()[]{}\n` → `true\n`; `([)]\n` → `false\n`; empty line → `true\n`. | Empty input line, one opener/closer, valid mixed nesting, mismatched types, premature closing, leftover opening, odd length, deep nesting, long alternating sequence. |

Publish 3 examples and 12 hidden cases per version initially. Hidden cases are deterministic fixtures with offline reference-derived expected outputs; never generate different random cases for opponents. Private test source control requires private repository access; API privacy alone does not hide fixtures in a public repository.

| Language key | Full-program entry and starter requirements | Existing candidate Judge0 ID |
| --- | --- | --- |
| `javascript` | Node.js; `require('fs').readFileSync(0, 'utf8')`; parse tokens while preserving blank line for parentheses; `process.stdout.write`. | 63 |
| `python` | Python 3; `sys.stdin.read()` and `sys.stdout.write`; preserve empty-string case. | 71 |
| `cpp` | C++17; `int main()`; `cin` for tokens or `getline` for string; `long long` for wide arithmetic; `cout`. | 54 |
| `java` | Public class `Main`, `public static void main(String[] args)`; buffered parser, `long` for wide arithmetic; stdout. | 62 |

IDs are candidates copied from the current sandbox, not guaranteed deployment capabilities. A server runtime registry validates configured IDs/names against the local `/languages` response and smoke-runs every profile. Publish language key, display/runtime name, Monaco mode, filename, starter, and limits through the public DTO. Map keys to IDs on the server; reject arbitrary numeric IDs. Start with these four languages; remove TypeScript from battle options until explicitly provisioned, and defer Go/Rust until reference solutions and fixtures pass for them.

Output comparison is application-owned: decode valid UTF-8, reject output above 64 KiB, split on ASCII whitespace, and compare exact token sequences. This accepts CRLF, tabs, and a trailing newline, but rejects extra tokens/debug output, reordered indices, `True`, `01` instead of `1`, and an empty answer. No floating-point or custom checker in v1. State this in every public output contract. Successful process execution alone is not acceptance.

## HTTP and socket interface

All routes require the parent's bearer authentication and participant/ownership checks. Return a non-revealing 404 for resources the caller cannot access. Use validated bodies and a stable `{error:{code,message}}` response.

| Route | Contract |
| --- | --- |
| `GET /api/matches/:matchId` | Public assignment DTO, participants keyed by user ID, persisted deadline/state/revision, own progress and persisted result. No private fixtures, opponent source, or tokens. |
| `POST /api/matches/:matchId/runs` | `{problemVersionId, languageKey, sourceCode, clientRequestId}`; creates a persisted `RUN` using examples only. Returns 202 with submission ID/state and Location. No ranking effect. |
| `POST /api/matches/:matchId/submissions` | Same body; creates `SUBMIT` over all examples and hidden cases. Server derives all tests and limits. Return 202 after submission and job commit. |
| `GET /api/submissions/:id` | Owner-only persisted state/verdict, visible example results, aggregate hidden passed/total count, bounded public diagnostics, timestamps. Never raw hidden stdout/stderr: a program can echo its private stdin. |

Reject missing/expired credentials, unassigned problems, disabled languages, closed/deadline-expired matches, empty or >64 KiB source, invalid UUID request IDs, and unexpected body fields (including verdict/test/limit fields). Repeating a request ID with identical content returns the original submission; different content returns 409. For v1 allow one nonterminal job per user across runs/submits, 6 requests/minute, and a bounded global pending queue; return 429 with Retry-After on saturation. Perform deadline validation and sequence allocation inside the insert transaction using database time. Exact deadline equality is late.

Server events: owner-only `submission_updated` with submission ID, revision, state/verdict and safe summary; `battle_progress` with per-user solved counts and revision; `battle_sync` as the canonical snapshot; `match_over` with persisted winner/loser IDs or draw/abort, reason, per-user rating deltas and real statistics. Only participants can subscribe/rejoin. Events are hints; HTTP snapshots recover missed updates. Remove handlers/types for `test_case_update` and `trigger_tiebreaker`; forged legacy events produce no progress or result changes.

Keep `/api/execute` as an explicitly separate practice surface with authentication, allowlists, quotas, and limits; it cannot update a battle. Share its execution adapter and capacity accounting so practice cannot bypass ranked limits.

## Judge worker and failure handling

Create `server/src/judging/{judge0-client,worker,comparator,public-result}.ts` plus `server/src/services/{submissions,match-resolution}.ts` and an authenticated route module. Start a bounded worker beside the local server initially; durable jobs allow a separate worker later without adding Redis.

Persist before execution. Claim a job with a lease; execute cases in stable order, with a small global concurrency limit (initially 4 case executions). Store each external token immediately and poll it asynchronously; do not keep HTTP requests waiting for compilation or depend on `wait=true`. Resume stored tokens after restart. Use bounded upstream request timeouts and polling backoff, a 120-second judge-job budget, and at most 2 infrastructure retries. Renew leases; writes must check the fencing generation so an expired worker cannot overwrite a newer attempt.

The [Judge0 CE v1.13.1 API documentation](https://ce.judge0.com/) describes token-based submission/polling, base64 transport, execution statuses, and configurable resource limits. Use `POST /submissions?base64_encoded=true&wait=false`, then GET the returned token with explicit result fields. Base64-encode source/stdin; decode output defensively. Send no expected answer to the user program and omit Judge0 `expected_output`; compare in Code Clash. Do not accept callback URLs, additional files, compiler flags, command-line arguments, or network settings from clients.

Use server-owned per-language profiles: initial CPU 2 seconds for C++ and 4 seconds for Node/Python/Java, wall time 10 seconds, memory 256 MiB for C++/Python and 512 MiB for Node/Java, file limit 64 KiB, one run, network disabled. Check these against the local Judge0 configuration and benchmark correct reference solutions; publish and freeze calibrated profiles before ranked release. Preserve Judge0 language defaults for process/stack behavior until verified with Java threads and runtime startup. Infrastructure must prevent execution containers reaching the application database or private fixtures.

Map queue/processing to pending states; successful exit to application output comparison; compiler failure to `COMPILATION_ERROR`; time failure to `TIME_LIMIT_EXCEEDED`; execution failure to `RUNTIME_ERROR`; internal/service failures to `JUDGE_ERROR`. Unexpected status or malformed output is an infrastructure error, never acceptance. Stop after compilation failure; otherwise collect bounded case results. Accept only when every required case passes. User errors are final, infrastructure errors retry within budget and do not count as wrong attempts. Keep hidden execution diagnostics private; visible example output and source-only compile diagnostics may be displayed after sanitization.

The POST-token crash gap may cause a duplicate isolated execution if Judge0 accepted work before its token was stored. Record attempts, bound retries, and account for this in quotas; promise exactly-once application effects, not exactly-once external execution.

## Battle resolution rules for v1

Two standard problems, 30-minute persisted duration. RUN never affects progress. A successful SUBMIT permanently solves that assigned problem; later failures cannot unsolve it. Count distinct solved assignments, not accumulated passed cases across submissions. Partial counts are feedback only.

Determine competitive ordering by server receipt sequence, not Judge0 completion time. Process each player's SUBMIT jobs in receipt order. Once a player has accepted both problems, record its completion sequence as the maximum sequence of the first accepted submissions. A candidate finish may resolve only after all earlier eligible submissions from either player have terminal results; this prevents a faster worker from choosing the wrong winner. The lower completion sequence wins. Sequence allocation is serialized under the match row lock and gives a deterministic order to near-simultaneous requests. An exhausted `JUDGE_ERROR` is not a competitive failure: if an eligible submission could affect the proposed outcome, abort without rating changes rather than treat it as a wrong answer. A failed RUN never requires a battle abort.

At deadline, move to `DRAINING`, reject new requests, and finish already committed pre-deadline submissions. Allow at most 180 seconds for draining, consistent with bounded job retries; unresolved infrastructure failures abort the match without rating changes. If neither player completed both, larger solved count wins; equal solved count draws. No client timer action is involved. Persist timer transitions and sweep active/draining matches on startup. A job finishing after a forfeit/completed/aborted result may update its own diagnostics but cannot alter match progress or ratings.

Apply the parent's explicit disconnect grace/forfeit policy rather than inventing a second one. Use persisted participant IDs after a socket disconnect. All concurrent judging, forfeit, deadline, and reconnect paths must lock/check the same match state and use the common resolver. Post-match metrics are derived from stored submissions/timestamps; remove invented complexity claims and AI coaching text unless a separate real analysis feature exists.

## Staged implementation and acceptance gates

1. **Reconcile parent contracts and remove verdict authority.** Read the final auth/matchmaking changes; establish user IDs, lifecycle/rating resolver, snapshots, and draw/abort DTOs. Disable legacy verdict/tiebreak handlers immediately. Gate: forged events cannot change results or ratings; valid authenticated matchmaking still works. Dependencies: completed parent auth work; no Judge0 dependency yet.
2. **Add schema, fixtures, and public projections.** Baseline/add migrations, seed two validated versions, add ordered assignment selection, runtime registry, and immutable public serializers. Gate: both players/reconnect get identical real assignments and deadlines; no placeholder fallback; hidden fields absent. Dependencies: stage 1 and disposable PostgreSQL migration rehearsal.
3. **Persist submission API and durable jobs.** Implement auth/ownership, strict validation, atomic idempotency/deadline checks, quotas, polling DTOs, leases and fencing. Use a deterministic fake adapter initially. Gate: duplicate requests create one job; another player cannot read source/results; restart does not lose pending work. Dependencies: stage 2.
4. **Implement Judge0 adapter and verdict aggregation.** Add limits, token persistence/polling, comparator, sanitization, retry taxonomy and bounded execution. Gate: correct reference programs pass every fixture in every supported runtime; sample-hardcoded and faulty programs fail hidden tests; service failures never become wins. Dependencies: stage 3 and healthy isolated Judge0.
5. **Wire transactional progress and resolution.** Implement receipt-order finish rules, deadline draining/startup sweep, common resolver and post-commit events. Gate: simultaneous finishes/forfeit/deadline/job replay result in one committed match and one rating update. Dependencies: stage 4 and parent's rating/disconnect service.
6. **Replace battle mocks and ship the end-to-end flow.** Show statement/constraints/examples/starters/limits; keep separate code drafts per problem/language; wire Run and Submit; show pending and real safe results; recover via snapshot/polling on reconnect; render persisted debrief. Gate: two independent authenticated browser sessions complete a real battle; no random result, simulated timer control, or client result event remains. Dependencies: stages 2–5.

## Meaningful verification

Use Node's test runner with the repository's existing TypeScript loader for server logic; add explicit test scripts rather than repurposing guest smoke scripts. Run database integration tests against a disposable application database and real Judge0 tests against the local isolated service, never an existing user database. A fake Judge0 HTTP server provides reproducible failure/race cases; real-runtime tests validate profiles and formats that mocks cannot.

| Suite | Required assertions |
| --- | --- |
| Fixture/compiler validation | Every reference solution passes all cases in all four languages. Hard-coded examples, reused-index Two Sum, wrong index order, crossed parentheses, empty-line bugs and quadratic large-input solution fail the intended fixtures. Independently validate fixture constraints and expected outputs. |
| Comparator | CRLF/tabs/trailing whitespace pass; missing/extra/reordered tokens, uppercase booleans, oversized/invalid UTF-8 output fail; successful no-output execution fails a nonempty answer. |
| API authorization/privacy | Anonymous/expired JWT, outsider, wrong problem, other user's submission rejected. Hidden input/answer/test IDs/tokens and opponent source absent from HTTP, sockets and sanitized diagnostics; an echo-stdin program cannot exfiltrate hidden input through returned stdout/stderr. |
| Persistence/quotas | Concurrent same-key POSTs produce one submission/job; changed content gives 409; quota/body/language rejection creates no job; submission insert at deadline is rejected atomically. Transaction failure cannot orphan a playable match or announce a result. |
| Worker robustness | Queue→processing→terminal polling; compilation/runtime/timeout/wrong answer; malformed response/status, upstream 422/429/500, request timeout; restart with stored tokens; crash before token write; lease expiry and stale writer; duplicate deliveries; exhausted retries produce infrastructure error, no score. |
| Match races | Later receipt judged first cannot win over an earlier successful finish; completing one problem cannot win the two-problem battle; RUN cannot solve; failed later SUBMIT cannot regress progress; post-deadline receipt rejected but pre-deadline pending results counted. |
| Resolution integrity | Concurrent acceptance/forfeit/deadline/disconnect resolve once; result/rating transaction rollback emits no final event; replay and restart do not double ratings; equal solved count draws; infrastructure drain failure aborts without rating changes. |
| Browser acceptance | Two registered users queue, receive identical examples, run without affecting opponent progress, submit a wrong then correct program, see persisted progress/result; reload and reconnect recover; outsider/forged legacy socket events cannot influence the match. |

Final release gate: run `npm run check` plus the new unit/integration suites, real Judge0 language/fixture smoke suite, and two-browser battle acceptance. Build/lint alone does not establish judging correctness. Update README/doctor with seed/migration/worker/test commands and an execution readiness check when implementation lands. Record calibrated runtime versions/limits and remaining production isolation requirements; no production ranked traffic until the private judge network and profiles are verified.
