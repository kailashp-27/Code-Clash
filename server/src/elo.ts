export function eloChanges(firstRating: number, secondRating: number, firstScore: 0 | 0.5 | 1) {
  const expected = 1 / (1 + 10 ** ((secondRating - firstRating) / 400));
  const first = Math.round(32 * (firstScore - expected));
  return [first === 0 ? 0 : first, first === 0 ? 0 : -first] as const;
}
