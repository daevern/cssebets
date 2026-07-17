// Pure settlement logic. NO side effects, NO Supabase imports.
// Kept in its own file so Vitest can test it directly without stubbing
// the server/admin client.

export type MarketContext = {
  homeScore: number;   // regulation FT home
  awayScore: number;   // regulation FT away
  htHomeScore: number | null;
  htAwayScore: number | null;
};

export type MarketSpec = {
  marketKey: string;
  period: string;
  line: number | null;
};

export type SettleDecision =
  | { status: "settled"; winningKeys: string[]; reason: string }
  | { status: "void"; reason: string };

function ouKeys(total: number, line: number, base: string): string[] {
  const suffix = line.toString().replace(".", "_");
  return total > line ? [`${base}_over_${suffix}`] : [`${base}_under_${suffix}`];
}

function ouDecision(total: number, line: number, base: string): SettleDecision {
  // Whole-number pushes can happen with lines like 2 or 3 but we only offer
  // .5 lines here, so no push case.
  const suffix = line.toString().replace(".", "_");
  const winning = total > line ? [`over_${suffix}`] : [`under_${suffix}`];
  return {
    status: "settled",
    winningKeys: winning,
    reason: `${base} total=${total} vs line ${line}`,
  };
}

export function decideWinningKeys(
  market: MarketSpec,
  ctx: MarketContext,
): SettleDecision {
  const { homeScore: h, awayScore: a } = ctx;
  const total = h + a;
  const key = market.marketKey;

  // --- Match / period result ---
  if (key === "match_result") {
    if (h > a) return { status: "settled", winningKeys: ["home"], reason: `FT ${h}-${a}` };
    if (h < a) return { status: "settled", winningKeys: ["away"], reason: `FT ${h}-${a}` };
    return { status: "settled", winningKeys: ["draw"], reason: `FT ${h}-${a}` };
  }

  if (key === "double_chance") {
    if (h > a) return { status: "settled", winningKeys: ["1x", "12"], reason: `FT ${h}-${a}` };
    if (h < a) return { status: "settled", winningKeys: ["12", "x2"], reason: `FT ${h}-${a}` };
    return { status: "settled", winningKeys: ["1x", "x2"], reason: `FT ${h}-${a}` };
  }

  if (key === "draw_no_bet") {
    if (h > a) return { status: "settled", winningKeys: ["home"], reason: `FT ${h}-${a}` };
    if (h < a) return { status: "settled", winningKeys: ["away"], reason: `FT ${h}-${a}` };
    // Draw → refund all bets (void).
    return { status: "void", reason: "DNB push on draw" };
  }

  // --- Full-time goals O/U ---
  if (key.startsWith("total_goals_")) {
    const line = market.line;
    if (line == null) return { status: "void", reason: "missing line" };
    return ouDecision(total, line, "goals");
  }

  // --- BTTS ---
  if (key === "btts") {
    const yes = h > 0 && a > 0;
    return {
      status: "settled",
      winningKeys: [yes ? "yes" : "no"],
      reason: `BTTS ${yes ? "yes" : "no"} (${h}-${a})`,
    };
  }

  // --- Goals odd/even ---
  if (key === "goals_odd_even") {
    const odd = total % 2 === 1;
    return {
      status: "settled",
      winningKeys: [odd ? "odd" : "even"],
      reason: `Total ${total} is ${odd ? "odd" : "even"}`,
    };
  }

  // --- Exact goals (0..5, 6+) ---
  if (key === "exact_goals") {
    if (total >= 6) return { status: "settled", winningKeys: ["exact_6_plus"], reason: `total=${total}` };
    return { status: "settled", winningKeys: [`exact_${total}`], reason: `total=${total}` };
  }

  // --- Winning margin ---
  if (key === "winning_margin") {
    if (h === a) return { status: "settled", winningKeys: ["draw"], reason: `draw ${h}-${a}` };
    const side = h > a ? "home" : "away";
    const diff = Math.abs(h - a);
    if (diff >= 4) return { status: "settled", winningKeys: [`${side}_by_4_plus`], reason: `${side} by ${diff}` };
    return { status: "settled", winningKeys: [`${side}_by_${diff}`], reason: `${side} by ${diff}` };
  }

  // --- Half markets (need HT scores) ---
  const needsHt = key === "1h_result" || key === "2h_result" || key.startsWith("1h_goals_") || key.startsWith("2h_goals_") || key === "highest_scoring_half";
  if (needsHt) {
    if (ctx.htHomeScore == null || ctx.htAwayScore == null) {
      return { status: "void", reason: "half-time score unavailable" };
    }
    const hh = ctx.htHomeScore;
    const ha = ctx.htAwayScore;
    const secondH = h - hh;
    const secondA = a - ha;

    if (key === "1h_result") {
      if (hh > ha) return { status: "settled", winningKeys: ["home"], reason: `HT ${hh}-${ha}` };
      if (hh < ha) return { status: "settled", winningKeys: ["away"], reason: `HT ${hh}-${ha}` };
      return { status: "settled", winningKeys: ["draw"], reason: `HT ${hh}-${ha}` };
    }
    if (key === "2h_result") {
      if (secondH > secondA) return { status: "settled", winningKeys: ["home"], reason: `2H ${secondH}-${secondA}` };
      if (secondH < secondA) return { status: "settled", winningKeys: ["away"], reason: `2H ${secondH}-${secondA}` };
      return { status: "settled", winningKeys: ["draw"], reason: `2H ${secondH}-${secondA}` };
    }
    if (key.startsWith("1h_goals_")) {
      const line = market.line;
      if (line == null) return { status: "void", reason: "missing line" };
      return ouDecision(hh + ha, line, "1H goals");
    }
    if (key.startsWith("2h_goals_")) {
      const line = market.line;
      if (line == null) return { status: "void", reason: "missing line" };
      return ouDecision(secondH + secondA, line, "2H goals");
    }
    if (key === "highest_scoring_half") {
      const firstTotal = hh + ha;
      const secondTotal = secondH + secondA;
      if (firstTotal > secondTotal) return { status: "settled", winningKeys: ["first"], reason: `1H ${firstTotal} > 2H ${secondTotal}` };
      if (secondTotal > firstTotal) return { status: "settled", winningKeys: ["second"], reason: `2H ${secondTotal} > 1H ${firstTotal}` };
      return { status: "settled", winningKeys: ["equal"], reason: `1H = 2H = ${firstTotal}` };
    }
  }

  // --- Team goals O/U ---
  if (key.startsWith("home_goals_")) {
    const line = market.line;
    if (line == null) return { status: "void", reason: "missing line" };
    return ouDecision(h, line, "home goals");
  }
  if (key.startsWith("away_goals_")) {
    const line = market.line;
    if (line == null) return { status: "void", reason: "missing line" };
    return ouDecision(a, line, "away goals");
  }

  // --- Clean sheets ---
  if (key === "home_clean_sheet") {
    const yes = a === 0;
    return { status: "settled", winningKeys: [yes ? "yes" : "no"], reason: `away scored ${a}` };
  }
  if (key === "away_clean_sheet") {
    const yes = h === 0;
    return { status: "settled", winningKeys: [yes ? "yes" : "no"], reason: `home scored ${h}` };
  }

  return { status: "void", reason: `unsupported market_key=${key}` };
}
