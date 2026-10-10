/** Rating is normalized from the 1–5 scale. Unknown response/completion metrics retain the existing neutral prior. */
export function trackRecordFromRating(averageRating: number | null, ratingCount: number): number {
  if (averageRating === null || ratingCount <= 0) return 0.5;
  const rating = Math.max(0, Math.min(1, (averageRating - 1) / 4));
  return (rating + 0.5 + 0.5) / 3;
}
