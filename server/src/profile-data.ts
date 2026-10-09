import type { PrismaClient } from '@prisma/client';
const tiers = [{ name: 'Bronze', min: 0 }, { name: 'Silver', min: 1000 }, { name: 'Gold', min: 1400 }, { name: 'Platinum', min: 1600 }, { name: 'Diamond', min: 1800 }, { name: 'Master', min: 2000 }];
export async function getProfile(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true, rating: true, wins: true, losses: true, draws: true } });
  if (!user) return null;
  const matches = await prisma.match.findMany({ where: { status: 'COMPLETED', OR: [{ player1Id: userId }, { player2Id: userId }] }, orderBy: [{ endedAt: 'asc' }, { id: 'asc' }], include: { player1: { select: { username: true } }, player2: { select: { username: true } }, assignments: true } });
  const recordedSubmissions = await prisma.submission.findMany({ where: { userId, mode: 'SUBMIT', match: { status: 'COMPLETED' } }, orderBy: { receivedAt: 'asc' }, select: { problemId: true, matchId: true, verdict: true, receivedAt: true, finishedAt: true, assignment: true, match: { select: { startedAt: true, endedAt: true } } } });
  const submissions = recordedSubmissions.filter(s => s.finishedAt && (!s.match.endedAt || s.finishedAt <= s.match.endedAt));
  let streak = 0, bestStreak = 0;
  let streakDate: Date | null = null;
  const changes = matches.map(m => {
    if (m.winnerId === userId) { streak++; bestStreak = Math.max(bestStreak, streak); if (streak === 3 && !streakDate) streakDate = m.endedAt; } else streak = 0;
    const first = m.player1Id === userId;
    return { matchId: m.id, rating: first ? m.player1RatingAfter : m.player2RatingAfter, change: first ? m.player1Change : m.player2Change, at: (m.endedAt ?? m.createdAt).toISOString() };
  });
  const ratingHistory = changes.filter((r): r is { matchId: string; rating: number; change: number; at: string } => r.rating !== null && r.change !== null);
  const peakRating = Math.max(user.rating, ...ratingHistory.map(r => r.rating), ...matches.map(m => (m.player1Id === userId ? m.player1RatingBefore : m.player2RatingBefore) ?? user.rating));
  const solved = new Map<string, typeof submissions[number]>();
  const topics = new Map<string, { name: string; solved: Set<string>; attempted: Set<string> }>();
  const solveTimes: number[] = [], firstPerMatch = new Set<string>();
  for (const s of submissions) {
    const name = (s.assignment.snapshot as { topic?: string }).topic ?? 'General';
    if (!topics.has(name)) topics.set(name, { name, solved: new Set(), attempted: new Set() });
    const t = topics.get(name)!; t.attempted.add(s.problemId);
    if (s.verdict === 'ACCEPTED') {
      if (!solved.has(s.problemId)) solved.set(s.problemId, s);
      t.solved.add(s.problemId);
      const key = `${s.matchId}:${s.problemId}`;
      if (!firstPerMatch.has(key) && s.match.startedAt) { firstPerMatch.add(key); solveTimes.push(Math.max(0, (s.receivedAt.getTime() - s.match.startedAt.getTime()) / 1000)); }
    }
  }
  const [total, above] = await Promise.all([prisma.user.count(), prisma.user.count({ where: { rating: { gt: user.rating } } })]);
  const position = above + 1, index = Math.max(0, tiers.findLastIndex(t => user.rating >= t.min));
  const tier = tiers[index]!, next = tiers[index + 1];
  const candidates = [
    { id: 'first-battle', title: 'Into the arena', description: 'Complete your first ranked battle.', progress: matches.length, target: 1, at: matches[0]?.endedAt ?? null },
    { id: 'first-win', title: 'First victory', description: 'Win a ranked battle.', progress: user.wins, target: 1, at: matches.find(m => m.winnerId === userId)?.endedAt ?? null },
    { id: 'first-solve', title: 'Code that counts', description: 'Solve a problem against every test in a completed battle.', progress: solved.size, target: 1, at: [...solved.values()][0]?.receivedAt ?? null },
    { id: 'ten-battles', title: 'Arena regular', description: 'Complete ten ranked battles.', progress: matches.length, target: 10, at: matches[9]?.endedAt ?? null },
    { id: 'three-streak', title: 'On a roll', description: 'Win three ranked battles in a row.', progress: bestStreak, target: 3, at: streakDate },
    { id: 'gold-rating', title: 'Golden standard', description: 'Reach a rating of 1400.', progress: peakRating, target: 1400, at: ratingHistory.find(r => r.rating >= 1400)?.at ? new Date(ratingHistory.find(r => r.rating >= 1400)!.at) : null },
  ];
  for (const badge of candidates) if (badge.progress >= badge.target) await prisma.userAchievement.upsert({ where: { userId_achievementId: { userId, achievementId: badge.id } }, update: {}, create: { userId, achievementId: badge.id, unlockedAt: badge.at ?? new Date() } });
  const earned = await prisma.userAchievement.findMany({ where: { userId } });
  const achievements = candidates.map(({ at: _at, ...b }) => { const row = earned.find(e => e.achievementId === b.id); return { ...b, progress: Math.min(b.progress, b.target), unlocked: !!row, unlockedAt: row?.unlockedAt.toISOString() ?? null }; });
  const totalBattles = user.wins + user.losses + user.draws;
  return { user: { id: user.id, username: user.username, createdAt: user.createdAt }, rating: user.rating, wins: user.wins, losses: user.losses, draws: user.draws, totalBattles, winRate: totalBattles ? Number((user.wins * 100 / totalBattles).toFixed(1)) : 0,
    currentStreak: streak, bestStreak, peakRating, rank: { name: tier.name, min: tier.min, nextMin: next?.min ?? null, progress: next ? Math.max(0, Math.min(100, (user.rating - tier.min) * 100 / (next.min - tier.min))) : 100 },
    leaderboard: { position, total, topPercent: total ? Number((position * 100 / total).toFixed(1)) : 100 }, solvedProblems: solved.size, acceptedSubmissions: submissions.filter(s => s.verdict === 'ACCEPTED').length,
    averageSolveSeconds: solveTimes.length ? solveTimes.reduce((a, b) => a + b, 0) / solveTimes.length : null, fastestSolveSeconds: solveTimes.length ? Math.min(...solveTimes) : null, ratingHistory,
    topics: [...topics.values()].map(t => ({ name: t.name, solved: t.solved.size, attempted: t.attempted.size })), achievements,
    recentMatches: matches.slice(-10).reverse().map(m => ({ id: m.id, opponent: m.player1Id === userId ? m.player2.username : m.player1.username, outcome: m.winnerId === null ? 'draw' : m.winnerId === userId ? 'win' : 'loss',
      ratingChange: m.player1Id === userId ? m.player1Change ?? (m.winnerId === userId ? m.winnerRatingChange : m.loserRatingChange) : m.player2Change ?? (m.winnerId === userId ? m.winnerRatingChange : m.loserRatingChange),
      createdAt: m.createdAt, endedAt: m.endedAt, reason: m.reason ?? 'Historical result', problemTitles: m.assignments.map(a => (a.snapshot as { title: string }).title) })) };
}
