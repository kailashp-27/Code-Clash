export type BattleLanguage = 'javascript' | 'python' | 'cpp' | 'java';
export interface JoinQueuePayload { mode?: 'ranked' }
export interface BattleProblem {
  id: string; title: string; description: string; difficulty: string; topic: string;
  totalTestCases: number;
  examples: { stdin: string; stdout: string }[];
  starters: Record<BattleLanguage, string>;
}
export interface SubmissionSummary {
  id: string; problemId: string; mode: 'RUN' | 'SUBMIT';
  state: 'QUEUED' | 'RUNNING' | 'FINISHED'; verdict: string | null;
  passed: number; total: number; time: number | null; memory: number | null;
  receivedAt: string; finishedAt: string | null;
}
export interface SubmissionDetail extends SubmissionSummary {
  sourceCode: string;
  language: BattleLanguage;
  examples: { verdict: string; stdout: string | null; stderr: string | null }[];
  compileOutput: string | null;
  integrity: Record<string, unknown> | null;
}
export interface MatchOverPayload {
  matchId: string; winnerId: string | null; reason: string;
  outcome: 'win' | 'loss' | 'draw' | 'cancelled';
  ratingChanges: Record<string, number>;
  ratingsBefore: Record<string, number>;
  ratingsAfter: Record<string, number>;
  players: Record<string, { username: string; solved: number; solveSeconds: number | null }>;
}
export interface BattleState {
  roomId: string; endTime: number; phase: 'standard';
  status: 'IN_PROGRESS' | 'DRAINING' | 'COMPLETED' | 'CANCELLED';
  players: Record<string, { username: string; rating: number }>;
  problems: BattleProblem[];
  progress: Record<string, { solved: number; problemIds: string[] }>;
  submissions: SubmissionSummary[];
  result: MatchOverPayload | null;
}
export type MatchFoundPayload = BattleState;
export interface ProgressPayload { passedCases: number; totalCases: number }
export interface ClientToServerEvents {
  join_queue: (payload?: JoinQueuePayload) => void;
  leave_queue: () => void;
  join_battle: (payload: { roomId: string }) => void;
  forfeit_match: (payload: { roomId: string }) => void;
  // Legacy commands remain typed for compatibility; the server rejects them.
  test_case_update: (payload: ProgressPayload & { roomId: string }) => void;
  trigger_tiebreaker: (payload: { roomId: string }) => void;
}
export interface ServerToClientEvents {
  match_found: (payload: MatchFoundPayload) => void;
  battle_sync: (payload: BattleState) => void;
  battle_progress: (payload: BattleState) => void;
  submission_updated: (payload: SubmissionSummary) => void;
  opponent_test_update: (payload: ProgressPayload) => void;
  match_over: (payload: MatchOverPayload) => void;
  queue_status: (payload: { status: 'queued' | 'idle' }) => void;
  server_error: (payload: { code: string; message: string }) => void;
  match_cancelled: (payload: { roomId: string; reason: string }) => void;
}
