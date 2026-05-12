export interface ProblemScoringParams {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  timeTakenMinutes: number;
  wrongSubmissions: number;
  hiddenCasesPassed: number;
  isSolved: boolean;
}

export interface ProblemScoreResult {
  total: number;
  baseScore: number;
  speedBonus: number;
  penalty: number;
  partialCredit: number;
}

export function calculateProblemScore(params: ProblemScoringParams): ProblemScoreResult {
  const baseScore = params.difficulty === 'HARD' ? 150 : 100;
  let score = params.isSolved ? baseScore : 0;
  
  let speedBonus = 0;
  // Speed bonus only applies if solved, and under 15 minutes for medium/easy
  if (params.isSolved && params.difficulty !== 'HARD' && params.timeTakenMinutes < 15) {
    speedBonus = 20;
    score += speedBonus;
  }
  
  const penalty = params.wrongSubmissions * 10;
  score -= penalty;
  
  let partialCredit = 0;
  // Partial credit if not solved completely
  if (!params.isSolved) {
    partialCredit = params.hiddenCasesPassed * 2;
    score += partialCredit;
  }
  
  return {
    total: Math.max(0, score), // Floor at 0 points
    baseScore: params.isSolved ? baseScore : 0,
    speedBonus,
    penalty,
    partialCredit
  };
}

export type MatchScenario = 'WIN_BOSS' | 'WIN_MEDIUMS' | 'LOSS_MEDIUMS' | 'LOSS_BOSS_TIEBREAKER' | 'FORFEIT';

export function calculateEloChange(scenario: MatchScenario): number {
  switch (scenario) {
    case 'WIN_BOSS': return 32;
    case 'WIN_MEDIUMS': return 18;
    case 'LOSS_MEDIUMS': return -20;
    case 'LOSS_BOSS_TIEBREAKER': return -15;
    case 'FORFEIT': return -25;
    default: return 0;
  }
}
