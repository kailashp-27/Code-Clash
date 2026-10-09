# Task 03: authoritative battle lifecycle

Status: original lifecycle proposal, followed by implementation verification on 2026-10-08. The parent implementation uses two problems in one 30-minute standard phase, receipt-order completion, deadline solved-count comparison, and a draw on equal solved counts; boss rounds, readiness windows, and outage pause/recovery below remain proposals rather than shipped behavior.

Verification added in `tests/battle.integration.test.cjs`: 12 integration cases (13 reported tests including the parent test) passed against real PostgreSQL and a local fake Judge0 service. They cover participant access, stable deadlines and reserved seats, concurrent exactly-once Elo settlement, draws/cancellation, request deduplication and conflicts, sample-versus-official scoring, output privacy, queued-work recovery after service recreation, deadline draining, out-of-order judging with receipt-order wins, infrastructure retry/cancellation, drain expiry, and persisted real profile achievements. Run after generating Prisma Client and building the server, with `CODECLASH_INTEGRATION=1`; default execution skips the suite. Every opt-in run creates and drops a uniquely named disposable database, leaving configured player data untouched. Real Judge0 execution, HTTP/socket authentication integration, and disconnect/server-outage behavior require separate end-to-end verification.

## Scope and observed starting point

- `server/src/socket.ts` owns an in-memory queue and room membership, creates a `Match`, sends mock problems, and resolves from client `test_case_update` counts. `join_battle` neither checks participation nor restores state; it generates a new one-hour deadline. `match_found` separately generates a 75-minute deadline. Clients can request the boss phase. Disconnect deletes the user mapping before triggering an immediate forfeit.
- Resolution broadcasts before persistence and increments user statistics regardless of whether the conditional match update actually claimed the match. Concurrent verdicts/forfeits can therefore apply multiple rating changes.
- `server/prisma/schema.prisma` has a single problem relation per match, two player relations, nullable winner/loser, and a string status. It has no phase deadlines, submissions, participant presence, or durable settlement record.
- `client/src/pages/LiveBattlePage.tsx` simulates verdicts with randomness, includes a test-end control, identifies players by socket ID/username, and renders invented debrief data. `client/src/utils/scoring.ts` has a candidate scoring formula and fixed scenario rating deltas; neither is authoritative.
- `/api/execute` in `server/src/index.ts` executes caller-supplied code/stdin through Judge0. This is sandbox execution, not verification against a versioned hidden test suite. The profile route currently presents every non-win as a loss and totals only wins plus losses.
- Parent work is implementing authenticated rating-based matchmaking. Re-read its resulting interfaces before implementing this plan; these observations describe the inspected snapshot, not a request to overwrite concurrent changes.

## Product rules proposed for lifecycle v1

These are explicit implementation defaults, not established existing product guarantees. Store a rules version and a copy of durations/scoring parameters on every new match so later configuration changes cannot alter a running game.

| Rule | Proposed behavior |
| --- | --- |
| Ready window | 30 seconds after committed assignment; both authenticated players must acknowledge readiness. No-show cancels without rating changes. |
| Standard phase | Two assigned standard problems, 60 minutes from the atomic start transaction. Resolves earlier only once both players have fully solved both problems and all accepted submissions are terminal. |
| Standard winner | Highest authoritative standard score. A complete solution to one problem alone never ends a match. Equal scores enter one boss round. |
| Boss phase | One separately assigned hard problem, 45 minutes. Earliest fully accepted submission wins, using server receipt order; otherwise highest boss score at deadline wins. Equal boss scores produce a draw. Standard scores do not break a boss tie. |
| Judging drain | At a phase deadline, stop accepting submissions and allow at most 90 seconds for already accepted submissions to finish. The submission receipt time determines eligibility, never callback arrival time. |
| Disconnect grace | 60 seconds from loss of the user's last active battle connection. Time continues; reconnect before expiry cancels that absence. |
| Explicit forfeit | Immediate defeat for that authenticated participant while the match is live, including judging drain. No grace for an explicit command. |
| Double absence | If both remain absent at the first applicable grace expiry, abort without rating/stat changes. If one returned before that expiry, the remaining absent player loses. |
| Platform failure | Unresolved eligible judging work after drain, or unrecoverable lifecycle state, aborts without rating/stat changes; infrastructure failures never count as wrong submissions. |
| Draw | Completed rated game, winner/loser null, rating adapter receives outcome 0.5 for both players. Preserve distinct draw statistics. |

Scoring v1 adopts the existing scoring utility's intent on the server: accepted standard problem base 100, boss base 150; +20 for a standard acceptance received strictly before 15 minutes of active phase time; -10 per terminal wrong official submission before that problem's first acceptance; unsolved partial credit = 2 times the best number of hidden cases passed by any single official submission; floor each problem at zero. Do not union cases across attempts. Runs on samples never affect score or penalties. Wrong verdicts include compile error, wrong answer, runtime error, and contestant time/memory limit exceeded; judge internal/network errors do not. Freeze a solved problem's first acceptance and penalty count, and reject later official submissions to it. Use receipt order, not verdict arrival order, when computing penalties and the first acceptance. Runtime/memory and speculative algorithmic complexity are not tiebreakers.

## Persisted schema changes (additive migration)

Retain `User` IDs, credentials, ratings, wins/losses, existing `Problem` records, and the current `Match` identity/player relations. Introduce the following via reviewed SQL/Prisma migrations; do not reset databases, recreate users, delete guest records, or use `--accept-data-loss`.

| Model | Fields / constraints |
| --- | --- |
| `Match` additions | `lifecycleVersion` nullable for legacy rows; `rulesVersion`, immutable `rulesSnapshot` JSON; `phase` STANDARD/BOSS; `version` integer; `readyDeadlineAt`, `startedAt`, `phaseStartedAt`, `phaseDeadlineAt`, `drainDeadlineAt`; `outcome` WIN/DRAW/ABORT/CANCEL; `reason`; `settledAt`; nullable pause metadata and saved resume state. Status values: PENDING, IN_PROGRESS, DRAINING, PAUSED, COMPLETED, ABORTED, CANCELLED. Existing `endedAt` remains the terminal timestamp. Index status/deadlines for recovery scans. |
| `MatchParticipant` | Composite key `(matchId,userId)`, unique `(matchId,slot)` for slots 1/2, `readyAt`, `ratingBefore`, `ratingAfter`, `ratingDelta`, `disconnectedAt`, `graceDeadlineAt`, `presenceEpoch`, score summaries. Participant IDs must match the retained player1/player2 relations. |
| `ActiveBattleSeat` | `userId` primary key, `matchId` FK. Reserve both seats with match creation in one transaction; release only at terminal settlement. This prevents cross-process double matching and requeue during a paused game. |
| `ProblemVersion` | FK to existing `Problem`, immutable statement/examples, difficulty, server-only suite revision/hash, runner/checker revision, allowed languages and resource limits. Never send hidden input/expected output in snapshots. |
| `MatchProblem` | `(matchId,phase,ordinal)` unique; FK to `ProblemVersion`; role/score parameters snapshot. Exactly two standard assignments and one boss assignment in v1. Retain `Match.problemId` as the legacy/primary standard problem reference. |
| `Submission` | UUID; match/user/problem-version/phase; client `requestId`; authoritative `receivedAt`, per-match increasing `receiptSequence`, active elapsed time at receipt; source or durable source reference; language; status QUEUED/RUNNING/FINAL/INFRA_ERROR/CANCELLED; judge job references; verdict, passed/total cases, judgedAt. Unique `(matchId,userId,requestId)` and `(matchId,receiptSequence)`. |
| `ParticipantProblemProgress` | Unique `(matchId,userId,matchProblemId)`; first accepted submission reference, accepted receipt time/sequence, best single-attempt passed count, wrong attempts, frozen score breakdown. Materialized from immutable terminal submissions; can be rebuilt. |
| `MatchSettlement` | `matchId` primary key; immutable outcome/reason, nullable winner/loser, final scores, rating policy version, per-user before/delta/after, decidedAt. Durable exactly-once guard alongside match status. |
| `BattleEvent` / outbox | Unique `(matchId,version,eventIndex)`; type, safe payload, createdAt, delivery metadata. Insert inside state transactions; retries may deliver duplicates, which clients ignore by version/event identity. |
| `LifecycleWorkerLease` | Lease key, owner UUID, epoch/fencing token, `leaseUntil`, `lastHealthyAt`. Prevent two scheduler/presence owners from processing the same generation. |
| `User` addition | `draws Int default 0`; retain wins/losses unchanged. Rating changes use the parent rating policy rather than this page's scenario deltas. |

Validate distinct players, nonnegative bounded passed cases, participant membership, winner/loser membership, terminal outcome consistency, and nonnegative durations through database checks plus service validation. A win requires different winner and loser; a draw/abort/cancel has neither. All state-changing transactions lock the match first, then both users in sorted ID order when settlement needs them.

Legacy rollout: nullable lifecycle fields prevent inventing authoritative history. Leave historical completed matches/statistics untouched, and label their details as legacy if new result fields are absent. Audit nonterminal legacy rows read-only, then explicitly migrate them to an unrated `ABORTED` reason `LEGACY_STATE_UNRECOVERABLE` without changing users. Do not infer lost progress or recompute historical ratings. Back up and verify the selected application database before applying a later implementation migration; this planning task runs no database commands.

## Lifecycle service and transitions

Create `server/src/battle/service.ts` for membership, commands, reconciliation, and settlement; `rules.ts` for pure scoring/outcome decisions; `scheduler.ts` for persisted deadlines/recovery; `snapshot.ts` for safe DTOs; and a separate judging adapter. Socket handlers become authenticated transport adapters, not competing owners of match state. HTTP snapshot/submission handlers call the same service.

1. Matchmaking commits assignment, participant rows, three versioned problem assignments, rules snapshot and reserved seats before publishing `match_found`. If judged problems are unavailable, do not offer a mock rated battle; return a clear unavailable response and preserve queue semantics from the parent implementation.
2. PENDING receives idempotent readiness commands. Both ready atomically sets IN_PROGRESS/STANDARD and the single persisted start/deadline. Ready timeout sets CANCELLED. Nothing resets deadlines on room join or refresh.
3. Official submission acceptance locks the match, reconciles due transitions, validates participant/active phase/problem/language and `DB now < phaseDeadlineAt`, and persists receipt metadata plus a durable dispatch job before acknowledging. A request received exactly at deadline is rejected. Deduplication returns the original acceptance even if the retry occurs after phase expiry; reuse of a request ID with different contents is rejected.
4. Trusted verdict ingestion verifies the durable job identity and suite version, deduplicates terminal results, updates progress in receipt order, and invokes reconciliation. Earlier pending submissions prevent declaring a later boss acceptance the winner. If needed, wait until every submission that could precede it is terminal; judge arrival order cannot decide a winner.
5. Standard timeout sets DRAINING/STANDARD with a drain deadline based on the original phase deadline. When eligible work is terminal, calculate standard scores and settle a win or atomically start IN_PROGRESS/BOSS. Equal zero scores also enter boss. Boss deadline/drain follows the same rule, then settles WIN or DRAW.
6. Early boss acceptance can settle only after earlier eligible work is terminal. For standard early completion, both players must have solved all standard assignments and all eligible work must be terminal. A pending problem acceptance is never an inferred win.
7. Forfeit, grace expiry, timeout, and verdict paths all use the same locked reconciliation/settlement transaction. Process logical deadlines in time order rather than handler scheduling order. Before a new command, apply due phase/grace events; an already eligible pending verdict still observes drain rules. At equal timestamps: reconcile phase/drain boundary first, then grace expiry, then the newly received command. Explicit forfeit can end an otherwise live draining phase; later callbacks cannot change the result.
8. Settlement claims a nonterminal match under lock, inserts the unique settlement, updates the match and users, releases seats and inserts result outbox events in one transaction. A failed claim changes no users. WIN updates one win/one loss; DRAW updates two draw counts; ABORT/CANCEL change neither stats nor ratings. Commit precedes broadcast. Retried settlement returns the stored result. User updates must increment from the transaction's current rating and store accurate before/after values; coordinate with the parent's rating adapter and active-seat invariant.

Use PostgreSQL time as the source of logical deadlines. Local `setTimeout` is only a wakeup optimization; a bounded periodic scan of due rows and transaction-time reconciliation provide correctness if a timer is lost. Versioned writes and row locks arbitrate races across processes. Database failures reject writes with retryable errors; never manufacture a local terminal result.

## Disconnect, reconnection, and restart recovery

### Participant presence

- Authenticate sockets to a stable `userId`; room IDs and payload usernames grant no authority. Verify database participation before joining `battle:<matchId>` or returning any private match data.
- Track all authorized connections per user/match. A tab closing is not an absence while another battle connection is live. On the last disconnect, persist the 60-second deadline under the match lock; keep participant identity and match association.
- A new authenticated connection rejoins by user ID and obtains a complete snapshot. Under lock, reconcile elapsed deadlines before clearing absence; arrival at or after grace expiry cannot revive a settled match. Repeated disconnect events do not extend the same absence. A genuinely resumed connection followed by a later absence gets a new grace interval.
- Version/epoch presence changes so a stale old-socket disconnect cannot clear a newer socket's presence. Single-process v1 may keep socket sets in memory with durable absence fields; multiple socket workers require a shared lease-backed presence registry and Socket.IO room adapter before rollout. Do not claim in-memory maps provide cross-worker correctness.
- Expired authentication requires a fresh valid session before commands are accepted. Failed authentication alone never proves an explicit forfeit. Queued users use the parent's queue disconnect policy; the battle grace rule applies only after start.

### Worker outages

Use a leased lifecycle owner with a 5-second durable healthy heartbeat and a 15-second expiry. Heartbeats are healthy only when the scheduler and database writes are operating. Persist outage handling instead of treating a process restart as two player disconnects.

1. Startup acquires a new fenced lease and scans nonterminal lifecycle-v1 matches before enabling battle commands. A stale worker cannot mutate state without the current fencing token.
2. Reconcile phase/grace deadlines known to have elapsed at or before the last healthy heartbeat. For matches live at that checkpoint, persist PAUSED with previous status/phase and remaining phase/drain/grace durations measured at that checkpoint. Heartbeat resolution bounds rollback to at most five seconds; retain all durably accepted submissions even if received after that checkpoint, and honor their stored phase/receipt metadata.
3. An outage interval longer than 120 seconds, or a missing trustworthy checkpoint, aborts affected started matches as `SERVER_INTERRUPTION` without rating changes. Unstarted assignments can be cancelled. Do not auto-forfeit participants during a server outage.
4. Otherwise offer a persisted 60-second recovery window. Both participants acknowledge `battle_resume_ready`; then restore prior status/phase and deadlines from saved remaining durations, clear pre-outage presence deadlines, and start fresh presence tracking. Recovery timeout aborts without rating changes. Paused time is excluded from speed bonuses and elapsed debrief time.
5. Reconcile durable judge jobs while paused; store verdicts, but defer outcome transitions to the resumed phase. Re-dispatch only through the judging adapter's job deduplication policy. Recovery of an already completed settlement simply returns its stored snapshot; it never awards ratings again.
6. Persist the checkpoint and recovery deadline for PAUSED matches, so another restart cannot repeatedly grant a fresh recovery window. DB time drives outage/recovery durations. A deliberate maintenance shutdown can persist PAUSED directly with an exact checkpoint.

This is an explicit pause-and-resume policy, not a claim of seamless availability. A future multi-worker deployment may keep running games live across a socket-worker restart only after proving scheduler and shared-presence failover; retain the same settlement and deadline invariants.

## Event and API contract

Share strict DTOs between client/server, replacing `battle_sync: any`. Include `protocolVersion`, `matchId` (retain `roomId` as a temporary alias), `version`, and `serverNow` on snapshots/events. Dates are UTC epoch milliseconds; keys are stable user IDs, never transient socket IDs. Membership errors must not reveal private match state.

| Direction | Contract |
| --- | --- |
| S -> C `match_found` | Committed assignment plus readiness deadline and initial snapshot; consume the parent's authenticated matchmaking payload via a documented compatibility adapter. |
| C -> S `join_battle` | `{matchId}` with acknowledgement returning the complete authorized snapshot, including terminal results. No mutation of start/phase deadlines. |
| C -> S `battle_ready` | `{matchId,requestId}`; idempotent acknowledgment. |
| C -> S `battle_resume_ready` | Same, for the persisted recovery window only. |
| C -> S `submit_solution` | `{matchId,matchProblemId,languageId,sourceCode,requestId}`; ack `{submissionId,receivedAt,receiptSequence}`. Rate/source-size limits and server-derived user identity. An authenticated HTTP equivalent calls the same service. |
| C -> S `forfeit_match` | `{matchId,requestId}`; acknowledge only after settlement commits. Duplicate commands return the same terminal result. |
| S -> C `battle_sync` | Full snapshot: status/phase, rules summary, safe assigned problems, participant IDs/names/starting ratings, authoritative per-problem score/progress, readiness/presence/recovery deadlines, phase/drain times and terminal result if present. Personalized fields identify `you.userId`. |
| S -> C `submission_result` | Own submission ID and safe verdict/aggregate progress; detailed sample output only for sample runs. No hidden stdout/input/expected values. |
| S -> C `opponent_test_update` | Server-derived per-problem aggregate with participant/problem IDs and match version; never accept client counts. |
| S -> C `match_over` | Outcome WIN/DRAW/ABORT/CANCEL, reason enum, nullable winner/loser user IDs, actual per-player rating deltas/after ratings, final phase/scores/debrief, endedAt. Same persisted result available by snapshot. |
| HTTP `GET /api/battles/active` | Authenticated active assignment/recovery lookup for refresh or missed `match_found`; backed by reserved seat. |
| HTTP `GET /api/battles/:id` | Authorized snapshot fallback when socket delivery is missed. |

Remove/reject ranked `test_case_update` and `trigger_tiebreaker`. Samples use a separate authenticated, limited execution path and cannot affect official progress. Reject malformed/unknown commands with typed acknowledgement codes: UNAUTHORIZED, NOT_PARTICIPANT, NOT_READY, PHASE_CLOSED, MATCH_FINISHED, RECOVERY_REQUIRED, INVALID_PROBLEM, INVALID_REQUEST, RATE_LIMITED, SERVICE_UNAVAILABLE. Server events are projections of committed state, not user commands.

Client integration: resubscribe/rejoin on every Socket.IO `connect`; replace rather than shallow-merge full snapshots; ignore old versions and fetch a snapshot on gaps. Estimate server clock offset from round-trip time and `serverNow`; show a countdown for display only. At zero show awaiting verdict/result rather than locally declaring an outcome. Support readiness, judging drain, reconnect grace, pause/recovery, draw and abort UI. Keep code drafts separately per match/problem/language, restore after refresh, and never autosubmit restored drafts. Remove randomness/test-end controls and derive debrief durations/scores/rating deltas from persisted result. Update `PostMatchDebrief` beyond its current boolean `isWin`; update profile history to distinguish outcomes, filter active/cancelled rows appropriately, count draws in completed battles, and preserve the legacy history rendering path.

## Dependencies on real judging and parent matchmaking

- **Matchmaking:** verified `socket.data.userId` (or equivalent), authenticated client handshake, stable user identity in payloads, rating policy ownership, one active match per user, committed Match ID before announcement, and cancellation/requeue semantics. Integrate seat reservation into its transaction; do not introduce a second queue. Keep matchmaking's rating-distance algorithm separate from settlement rules.
- **Problem catalog:** exactly two standard and one boss problem with immutable statements, hidden suite/checker versions, language-compatible runners, and explicit limits. Database problem IDs must match delivered assignments; existing mock IDs are unusable for rated judging.
- **Judge pipeline:** durable official-submission dispatch, hidden-suite execution and deterministic checker, per-case verdict aggregation, trusted server-side job/result association, idempotent retries, bounded polling, and distinction between contestant and infrastructure failure. Never use a browser-provided Judge0 token, passed count, time, or acceptance as evidence.
- **Async contract:** `enqueueOfficialSubmission(submissionId)` and trusted `recordVerdict(submissionId,jobIdentity,suiteVersion,verdict)`; dispatch intent persists transactionally so a crash before external enqueue cannot lose work. All hidden-suite and checker data remain server-only. Judge credentials, resource limits, source retention/access policy and execution capacity are judged-system responsibilities.
- **Rating:** call a server rating policy with starting/current ratings as defined by the parent, outcome 1/0 or 0.5/0.5, and an immutable policy version. Do not copy fixed ±25 or UI scenario deltas. Store per-user deltas even if rounding is asymmetric. Abort/cancel skips policy entirely.
- **Availability:** ranked scoring/automatic victory is not releasable until real judging is available. Lifecycle tests can inject a fake trusted judge adapter; fake verdicts must never be accepted from production sockets. Readiness/recovery and unrated fixture demos can be developed independently.

## Acceptance tests

Use an isolated disposable application database and explicit fixture users; never run prototype matchmaking scripts against preserved player data. Use an injectable clock with PostgreSQL integration checks, a fake trusted judge adapter, and authenticated Socket.IO clients. Assert persisted state, broadcasts, stats and ratings together.

1. Unauthorized/nonparticipant room join, submission, forfeit and recovery readiness fail without revealing a snapshot or altering state. Spoofed user IDs/usernames and old score/tiebreaker events cannot change progress.
2. Both readiness commands create one start/deadline; duplicate ready/join/refresh never extends it. No-show cancels, releases seats and preserves all user ratings/statistics.
3. One solved problem does not win; score includes both standard problems. Both players solving ends standard early only after accepted work drains; equal scores start exactly one boss round.
4. Boundary submissions at deadline minus 1 ms are eligible; at deadline and later are rejected. A retry of an accepted request after deadline returns its original ID. Lost acknowledgement/double submit never creates two jobs or penalties.
5. Out-of-order judge callbacks produce the same acceptance time, penalties and score as receipt order. Sample runs and infrastructure errors add no score/penalty. Best partial credit comes from one attempt; solved scores freeze.
6. A verdict delivered during drain counts if received before cutoff. No late receipt counts. At drain expiry unresolved eligible work aborts without rating changes. Late results after terminal state cannot reopen a phase.
7. Boss acceptance races choose earliest receipt sequence regardless of callback order, waiting for earlier work. Neither acceptance nor unequal boss score is replaced by a client-supplied winner; equal boss scores draw.
8. Verdict, timeout, forfeit and grace expiry executed concurrently from multiple workers produce exactly one settlement and one set of user updates. Test duplicate deliveries, failed transactions, serialization retries and crash immediately after commit/before broadcast.
9. Disconnecting one of two tabs does not start grace. Last-tab disconnect does; stale disconnect after rejoin does not overwrite presence. Reconnect at 59,999 ms retains time/progress; at 60,000 ms receives reconciled terminal state.
10. Single absence expiry loses; double absence at first grace deadline aborts. Reconnect of one player before that deadline makes the remaining absence a loss. Deadline/grace ties follow documented ordering.
11. Server restart restores deadlines/progress/seat ownership and durable jobs. Outage pause excludes unavailable time; both resume once. Repeated restart does not reset recovery window. Outage >120 seconds or missing checkpoint aborts; stale fenced workers cannot settle or extend deadlines.
12. Judge dispatch crash before/after external enqueue does not lose a submission or duplicate a recorded verdict. A terminal snapshot remains available when outbox/socket delivery fails, and ratings never replay.
13. DB outage rejects commands without local success/winner broadcasts; retry reconciles real state. Timer loss is repaired by deadline scan. Test a deadline already expired before last healthy heartbeat separately from a deadline crossed during outage.
14. Client skewed clock, missed `match_found`, reconnect with a new socket ID, duplicate/out-of-order events, and page refresh recover by stable user ID/full snapshot. Zero countdown cannot award a win. Draw/abort never renders defeat or a fabricated rating delta.
15. Legacy completed matches and existing users keep IDs, passwords, ratings and win/loss counts after migration. Legacy nonterminal cleanup does not mutate users. Profile shows draws separately and existing history remains readable.

## Implementation sequence and completion gate

1. Confirm the parent's final authenticated matchmaking and rating interfaces; finalize proposed durations/scoring/recovery rules in a versioned rules module.
2. Add reviewed additive migrations and immutable problem assignments; implement transactional service, seats, safe snapshots and exactly-once settlement with fixture database tests.
3. Implement persisted deadline reconciliation, presence epochs, lease fencing, outage pause/recovery and transactional outbox.
4. Integrate real judge dispatch/verdict contract; verify ordering, eligibility and infrastructure-abort behavior. Block ranked launch until this contract and catalog are ready.
5. Adapt socket/API DTOs and battle/debrief/profile clients; remove simulation paths from ranked flow.
6. Run existing frontend lint/server and client builds plus lifecycle integration tests, then verify a complete authenticated two-player battle against real Judge0, including refresh, disconnect/reconnect, deadline, draw, forfeit and process restart in an isolated environment.

Done means state/deadlines/results survive reconnect and restart; only trusted judging produces progress; every outcome applies statistics/ratings at most once; cancelled/aborted games preserve ratings; users can recover missed terminal events; and preserved player data passes the migration checks. This document itself requires only content review and file verification, not a database migration or application test run.
