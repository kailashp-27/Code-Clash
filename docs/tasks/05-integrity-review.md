# 05 — Post-judging submission-integrity review

Status: planning only; implementation deferred until persistent real battle submissions exist.
Prepared: 8 October 2026. This task authorizes this document only: no application changes, database changes, provider installation, or player-code transmission.

### Later authorized implementation update — 8 October 2026

The subsequent build request authorizes a bounded local similarity helper in `server/src/integrity.ts` and focused tests in `tests/integrity.test.cjs`. The original planning scope above describes the earlier task. This helper is ready for integration; enabling persisted review still depends on the authoritative submission flow owned by the main implementation task. No AI detector or external provider is added.

Integration contract: `analyzeIntegrity(source, peers, ownUserId)` returns JSON containing `state`, `aiAssessment`, `similarity`, `signals`, `review`, and `version`. The caller supplies only authorized completed submissions in the intended problem/language scope and persists owner-only results. It must enforce its own source limit and candidate limit and record the actual comparator scope/provenance alongside the returned JSON. The helper also bounds inputs defensively at 64 KiB UTF-8, 8,192 tokens, and the first 50 supplied candidates. Same-user candidates are excluded; peer source/user IDs never appear in the result. A matched submission ID is a reviewer reference and grants no permission to read that submission.

Algorithm version `local-token-similarity-v1` scans lexical tokens, ignores comments/whitespace, consistently renames identifiers by first appearance, and preserves literal/number values. It compares sets of consecutive seven-token sequences using Jaccard overlap, with a review threshold of 0.85 and at least 24 shared sequences. Inputs need at least 80 tokens, three control-flow keywords and 24 distinct sequences. These gates exclude short/simple solutions and typical entry-point scaffold; they are conservative heuristics, not validated error-rate guarantees or universal boilerplate removal. Contextual template exclusion and local evaluation remain necessary before broader rollout. Scores are overlap fractions, never AI probabilities. Uncompared or ineligible inputs return `not_assessed` with null score. `no_similarity_found` means no above-threshold overlap among eligible supplied candidates, not proof of independence.

This scanner is not a multilingual parser: escaped and triple-quoted literals are opaque; malformed strings/comments, interpolated backtick templates, and non-ASCII syntax outside literals abstain. Language-specific constructs such as JavaScript regular-expression literals, C++ raw strings, Python interpolation and floor division require parser-aware normalization for reliable language coverage. Do not infer broad language support from the current lexical helper. Identifier renaming may also make independent implementations appear similar. AI comment markers do not alter authorship assessment: `aiAssessment.state` always remains `not_assessed`, with an explanation that code alone cannot establish AI assistance or misconduct. Every result has `review.status: unreviewed`. The module has no I/O, external transmission, judgment or Elo writes.

Validation: the helper passes standalone strict TypeScript checking and nine focused tests covering identical/renamed nontrivial submissions, comments and escaped/triple-quoted strings, malformed literals, interpolated-template abstention, common entry-point scaffold, short code, distinct algorithms, same-user exclusion, no eligible peers, AI-marker neutrality, and bounded inputs/candidates. The initial full server build passed; a later build during concurrent integration reported an unrelated `src/problems.ts:46` Prisma JSON assignment error. Full integration validation belongs to the main implementation task.

## Objective and boundaries

Add an asynchronous, post-judging review that helps authorized reviewers examine submission integrity, including possible prohibited AI assistance. Correctness judging, match resolution, scores, wins/losses, and Elo remain independent of review availability and results.

Code-only AI classification is explicitly uncertain and advisory. It cannot establish authorship, determine whether assistance violated a rule, automatically penalize a player, or affect Elo. A weak or absent signal does not establish human authorship either. Similarity measures overlap between submissions or reference material; it does not establish AI authorship, copying direction, intent, or plagiarism. Keep these as separate evidence channels, never a combined “cheating probability.”

No automatic bans, disqualifications, forfeits, score changes, rating changes, matchmaking restrictions, or public accusations may follow from a detector result, similarity score, review backlog, or missing evidence. This feature has no enforcement or Elo write path. Any future enforcement capability is a separate policy and implementation task requiring independent evidence, human adjudication, appeal, and explicit authorization; detector output alone remains insufficient.

No player code may leave the deployment for an integrity provider without a later explicit configuration choice. Existing execution infrastructure is not authorization for a new analysis destination. No silent fallback to hosted detection, remote embeddings, model-based judging, telemetry, crash reporting, or hosted similarity services.

## Repository findings and prerequisite

Reviewed the current working tree, including its existing uncommitted changes. Findings describe this snapshot, not a completed ranked architecture:

| Location | Current behavior | Consequence for this task |
| --- | --- | --- |
| `README.md` | Documents simulated battle judging and real execution only in the sandbox. | Do not present prototype output as assessed submissions. |
| `client/src/pages/LiveBattlePage.tsx` | Holds editor code in local state; `handleRunCode` generates random passed-case counts and emits `test_case_update`. Debrief scores, times, complexity and coaching points include fixtures. | There is no trustworthy persisted battle source or result to analyze. Existing “AI debrief” is not authorship evidence. |
| `server/src/socket.ts` | Uses socket-associated guest users and in-memory room maps, broadcasts client progress, resolves a victory from client passed/total counts, and updates ratings by a fixed 25 points. | Establish authenticated participant identity and authoritative real judging first. Integrity must not hook into these current progress or rating callbacks. |
| `server/src/index.ts`, `client/src/components/Sandbox.tsx` | `/api/execute` forwards source/language/stdin to configured Judge0 and returns execution output, without application submission persistence or match/problem linkage. | A sandbox run or Judge0's own internal storage is not an authoritative battle submission archive. |
| `server/prisma/schema.prisma` | Defines `User`, `Problem`, and `Match`; no submission, judge-run, evidence, or review models. | New persistence is a prerequisite, not a change made by this plan. |
| `client/src/socket/events.ts`, `client/src/utils/scoring.ts` | Progress/match events have no integrity contract; client rating helper uses scenario constants. | Future integrity events and APIs must be independent of score/Elo contracts. |
| `client/src/pages/TermsPage.tsx` | Broadly prohibits automated solving in ranked matches and claims display/archive rights. | Specify assistance categories, disclosure, retention and review/appeal rules before rollout. Existing text does not authorize external analysis transmission. |

**Hard dependency:** a separate judging/persistence task must first implement authenticated, immutable battle submissions with stable IDs, authoritative problem/test versions, server timestamps, source snapshots, language/compiler mapping, judge-run IDs and terminal verdicts. Recover persisted source and results after restart. Reject unauthorized submissions and forged client progress as authoritative results. Finalize match outcomes exactly once. Do not backfill imaginary source, use the current fixtures as historical evidence, or scrape Judge0 internals as a substitute.

## Primary evidence and design implications

Sources researched on 8 October 2026. Findings are limited to each study's evaluated datasets and detectors; none validates classification of individual Code Clash players.

1. Suh et al., *An Empirical Study on Automatically Detecting AI-Generated Source Code: How Far Are We?* ([author preprint, 2024](https://arxiv.org/abs/2411.04299), [ICSE 2025 publication DOI](https://doi.org/10.1109/ICSE55347.2025.00064)). The authors report poor performance/generalization for existing tools and an improved experimental model with F1 82.55. This aggregate benchmark measure is not a probability that a particular player used AI. Do not reuse benchmark thresholds without relevant local evaluation.
2. Guo et al., *CodeMirage* ([2025 author paper](https://arxiv.org/html/2506.11059v1)). Evaluates ten detectors across ten languages and ten generators, including paraphrased code. It reports worse performance outside the training distribution and reduced detection at low false-positive rates, despite stronger F1 results. Evaluate unseen generators, transformations and operational false alarms separately; an impressive headline score is insufficient.
3. Orel et al., *AICD Bench* ([2026 author preprint](https://arxiv.org/abs/2602.02079)). Tests distribution shifts and human/machine/hybrid/adversarial categories across a large corpus. Authors report substantial practical limitations, particularly for shifted and mixed or adversarial code. Treat partial assistance as distinct from whole-code generation; do not force all code into binary human/AI labels. This preprint is research evidence, not a deployed guarantee.
4. Alex Aiken's [official Moss documentation](https://theory.stanford.edu/~aiken/moss/) states that software similarity requires human interpretation and scores do not prove plagiarism; it supports excluding supplied common code. It also describes hosted results containing submitted code accessible through result URLs. Use it as evidence for interpretation/privacy boundaries, not as a selected provider.

Design inference: final code alone cannot reliably recover the creation process or distinguish permitted help from prohibited assistance. Standard algorithms, boilerplate, short solutions, shared problem constraints, human edits and language differences require abstention and contextual review. Do not use an LLM's unsupported “looks AI-generated” opinion, comments, naming style, speed, or paste events as proof. No detector or vendor is selected by this plan.

## Proposed records and states (conceptual, no migration yet)

Keep authoritative `Submission`/`JudgeRun` records owned by the prerequisite task. Integrity records reference their immutable IDs and source hashes. Preserve originals; normalization operates on derived copies with versioned mappings back to source lines.

Proposed logical records:

- `IntegrityAssessment`: submission/judge-run IDs, signal kind (`similarity` or `ai_assistance`), processing status, reason code, evidence references, completion time, and configuration version. Assess all eligible judged attempts under a documented scope, including failed attempts, rather than only winners. Keep distinct assessments per attempt.
- `AssessmentRun`: immutable run ID, source hash, analyzer/model artifact identifier and version, local/remote mode and destination if authorized, preprocessing version, language and length applicability, comparator corpus snapshot, threshold/calibration version, start/end times, bounded error reason, raw score semantics, limitations, and superseded-run link. Null scores mean absent assessment, never zero risk. Retries do not erase prior failures.
- `SimilarityEvidence`: comparator IDs/hashes, problem/language context, matched ranges, overlap denominator and normalization method, excluded starter/library ranges and exclusion version. Retain enough context for a reviewer to judge common solutions; a percentage has no authorship meaning.
- `ReviewCase` and append-only `ReviewAction`: evidence/run IDs, applicable match-time rules version, assignment, reviewer identity, contextual observations, rationale, player response, disposition and appeal history. Record who accessed or exported sensitive evidence. An integrity case cannot mutate match or rating records.

Processing status is independent of human review disposition:

| Status | Meaning and presentation |
| --- | --- |
| `not_assessed` | No analysis attempted: feature disabled, no configured analyzer, pre-persistence match, missing source, outside documented review scope, or withdrawn data. Show reason; no conclusion. |
| `queued` / `running` | Accepted for post-judging processing / currently processing. Pending is not a finding. |
| `unavailable` | Requested analysis cannot provide a usable result: timeout, worker/provider failure, unsupported language, insufficient code, parse failure, corrupt snapshot, or missing comparator corpus. Include retryability/reason; no conclusion. |
| `completed` | A valid analysis result exists. It can still be inconclusive or abstain; completion is not confirmation of misconduct. |

For completed AI analysis, use advisory outcomes `inconclusive`, `no_reliable_signal`, or `signal_for_review`; all explicitly state “AI assistance cannot be determined from code alone.” Never use `human`, `AI-authored`, `cheater`, or an uncalibrated probability label. Store raw scores only with their meaning and evaluation provenance. Unsupported/short inputs should abstain as `unavailable`, not fabricate scores. Missing models default to `not_assessed`.

Human case states: `open`, `in_review`, `awaiting_player_response`, `closed`, `appealed`, `appeal_review`, `appeal_closed`. Closure dispositions: `insufficient_evidence`, `no_violation_found`, or `policy_violation_supported_by_independent_evidence`. Record the independent evidence and applicable rule for the last disposition; a detector signal alone cannot support it. A closed case may be reopened only with an audited reason, and appeals preserve the original disposition and correction history.

## Staged implementation

### Stage 0 — Persistence and policy gate

Wait for the separate real-submission prerequisite. Define permitted/disallowed AI use (generation, explanations, autocomplete, debugging, refactoring), disclosures, eligible modes/attempts, reviewer access, retention/deletion, and appeal procedures before collecting additional evidence. Pin policy to the match; do not retroactively apply new rules. Mixed or declared permitted assistance is not a violation by itself.

Gate: real source and judge verdict survive restart, participant authorization is verified, and authoritative match results are independent of integrity. Legacy/simulated matches remain `not_assessed`. Approve concrete storage/retention policy before implementing records; no new keystroke, clipboard, screen, or device surveillance is included.

### Stage 1 — Local review foundation

After the gate, add separate review persistence, role-authorized read/review APIs and an asynchronous worker. Enqueue only after a terminal authoritative judge verdict is durably committed, using an outbox or equivalent durable handoff. Scope by immutable submission ID, judge-run ID, analyzer/configuration version; ensure idempotency and recover jobs after worker restart. Rejudging produces a versioned assessment reference, not a second rating resolution. Analyze bounded source as untrusted data without executing it; sandbox parsers if needed.

Keep review disabled by default and expose truthful `not_assessed` states. Worker outages or late results must not delay judging, match completion, debrief availability, or Elo settlement. Apply bounded time/resource limits, capped retry with backoff and explicit `unavailable`; provide authorized manual retry. Validate hash linkage before processing and publishing results. Never put source bodies in logs or analytics.

Gate: crash/retry tests show no lost eligible jobs, duplicate cases or score/rating writes; authorization prevents arbitrary room/submission access. Source retention and deletion include originals, normalized copies, comparison indexes and derived evidence, with documented bounded appeal holds.

### Stage 2 — Similarity review first

Start with a local comparator over authorized retained submissions for the same problem/version and compatible language. Document comparison scope and limitations; no cross-language coverage claim without validation. Exclude supplied templates and common scaffolding. Preserve matched spans and corpus/version metadata; keep exact hashes and normalized/token similarity distinct. A canonical algorithm or identical short solution can be legitimate. Similarity flags open advisory review candidates, not automatic cases of misconduct.

Gate: known shared templates do not produce unexplained accusations; identical, independently written canonical solutions receive contextual handling; unsupported inputs/corpus failure have truthful states; private comparator code is restricted to authorized reviewers.

### Stage 3 — Optional AI-assistance research pilot

Remain local by default. Select a reproducible local analyzer only after independent offline evaluation on consented or licensed, provenance-labelled fixtures. Do not train on operational player submissions by default or manufacture human labels from detector predictions. Pilot output is visible to reviewers only and cannot determine a violation.

Split evaluation by problem/task and author/source family to reduce leakage. Hold out generators and evaluate each supported language, code length, problem difficulty, canonical algorithm, template, formatting/renaming/comment edits, refactoring, mixed human/AI code and declared permitted assistance. Track false-positive rate with sample sizes/confidence intervals, precision under plausible base rates, recall at fixed false-positive rates, abstention rate, calibration where probabilities are claimed, and performance drift. Freeze thresholds on validation data before held-out testing. Benchmark F1 alone cannot pass the gate.

Set a documented acceptable false-alarm budget and review capacity before inspecting pilot results; no numeric threshold is justified by current evidence. If local evidence is inadequate for a language or condition, keep that condition `not_assessed`/`unavailable` and abstain. Model or preprocessing changes require reevaluation and new versioned runs. Support a kill switch returning new assessments to `not_assessed`, while preserving historical provenance.

Gate: reviewer guidelines and uncertainty copy are validated, pilot false positives are independently reviewed, and useful signals can be distinguished from template/style effects. Failure to pass means the AI channel remains disabled; similarity/manual review can continue.

### Stage 4 — Player review, appeal and controlled rollout

Add a separate integrity section near the post-match debrief, backed by persisted assessments rather than fixture coaching text. Show “Not assessed,” “Analysis unavailable,” “Review pending,” or “Advisory signal — inconclusive about authorship,” with reason and date. Never a red guilt badge, “X% AI,” public opponent accusation, or change to score/rating display. Players access their own case; reviewers access authorized evidence; opponents receive no private source or allegations.

When a case warrants player contact, provide the rule version, specific evidence and limitations, a reasonable response period, and an appeal route. Explain legitimate common algorithms, templates, personal snippets, accessibility workflows and permitted assistance before reaching a finding. Offer optional provenance such as existing development history or a solution explanation; do not demand private AI accounts, install surveillance, or infer guilt from missing voluntary evidence, inability to explain on demand, or failure to respond alone.

Require a second reviewer before recording a policy-violation disposition; an independent reviewer handles appeal. Reviewers document corroborating evidence, alternative explanations and contradictions. Preserve audit history while correcting erroneous findings, removing unsupported flags from active views, notifying the affected player of correction and reevaluating similar cases if an analyzer defect is found. Monitor overturned cases and false-positive patterns without turning them into new player-risk scores. Neither review nor appeal writes Elo or applies penalties in this feature.

Gate: player notice/response/appeal works end to end; review staff can explain uncertainty; disabled/unavailable results are never treated as guilt or exoneration; access and deletion controls pass verification. Roll out incrementally with operational metrics that exclude source content and identifiable allegation data.

## External-provider decision, deferred

A later explicit configuration choice must identify provider/destination, the exact data leaving the deployment, authorized comparison scope, retention and deletion, model-training use, access controls, and failure behavior. Require an auditable configuration version and player-facing disclosure under the chosen policy before any transmission. Default external transmission to off and prevent remote fallback in code. Include similarity services and embedding APIs in this restriction, not only AI detectors. Moss is a hosted service, so it is not a local default.

No provider signup, API key, SDK, remote call with player source, or database migration is part of this task. Research browsing transmitted search terms/public URLs only, not repository or player source.

## Future verification checklist

- A real submission is judged and its match settles before assessment; forced worker failure, slow analysis, disablement and retries leave verdict, scores, wins/losses and Elo unchanged.
- Missing historical source => `not_assessed`; unsupported/short source or analysis outage => `unavailable`; completed ambiguous output => inconclusive. All absent scores stay null across API/UI serialization.
- Duplicate job delivery, restart, rejudge and changed analyzer version preserve immutable provenance without duplicate cases or ratings. Tampered source/hash mismatch yields no result.
- High similarity has span/context evidence and never populates an AI-authorship field. Common scaffold/canonical-solution fixtures and independent human submissions exercise false-positive handling.
- Forged client status/score, unauthorized submission IDs and guessed review IDs are rejected. Players cannot read another player's source, case or comparator evidence.
- Detector signals alone cannot record a supported policy violation; independent review, player response and appeal preserve rationale/history and correct a false positive.
- An egress test verifies default local/disabled analysis makes no external source-bearing requests, including retries, logs, telemetry and fallbacks. Any later authorized remote mode is confined to the named destination/data scope.
- Retention expiry, deletion and appeal holds cover derived copies and indexes; access/export logs contain metadata rather than code. Model updates invalidate applicability until reevaluated.

## Deliverable and completion criteria

This planning task is complete when this document is saved with repository findings, primary-source evidence, staged prerequisites and the above uncertainty, privacy, provenance and appeal boundaries. Application implementation remains explicitly deferred. Future changes should target the judging/persistence layer first, then separate server review modules and authorized APIs, and finally the post-match UI/events; there is no integrity dependency in scoring or Elo.
