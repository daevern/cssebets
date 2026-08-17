/**
 * Pure settlement guards — no DB. Used by settlePredictionsForMatch and tests.
 */

export type MatchScoreBasis = {
  home_score: number | null;
  away_score: number | null;
  ft_home_score: number | null;
  ft_away_score: number | null;
};

/**
 * 90-minute markets grade on regulation. If the match went to extra time and
 * the caller passes the aggregate FT score instead of regulation, block settle.
 * Returns an error message, or null when the settle scores are acceptable.
 */
export function regulationSettleBlockReason(
  match: MatchScoreBasis,
  homeScore: number,
  awayScore: number,
): string | null {
  const reg = match.home_score;
  const regA = match.away_score;
  const ft = match.ft_home_score;
  const ftA = match.ft_away_score;
  const wentToET = reg != null && ft != null && (reg !== ft || regA !== ftA);
  if (wentToET && (homeScore !== reg || awayScore !== regA)) {
    return (
      `Refusing to settle on non-regulation score ${homeScore}-${awayScore}. ` +
      `Regulation is ${reg}-${regA}, aggregate is ${ft}-${ftA}. ` +
      `90-minute markets grade on regulation.`
    );
  }
  return null;
}
