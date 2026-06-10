// Pure client-side Bookmaker Profitability Simulator
// Monte Carlo engine — no real money, virtual analytics only.

export type OddsSource = "real" | "margin5" | "margin10" | "custom";
export type Behaviour = "random" | "casual" | "sharp" | "mixed";
export type BetType =
  | "match_winner"
  | "double_chance"
  | "over_under"
  | "btts"
  | "correct_score"
  | "outright";

export interface SimInputs {
  users: number;
  betsPerWeek: number;
  weeks: number;
  minStake: number;
  maxStake: number;
  avgStake: number;
  oddsSource: OddsSource;
  customMargin: number; // percent
  behaviour: Behaviour;
  betTypes: BetType[];
  iterations: number;
  startingBankroll: number;
}

export interface ScenarioResult {
  label: string;
  expectedProfit: number;
  expectedPayout: number;
  maxLiability: number;
  bankrollRequired: number;
  chanceOfLoss: number;
}

export interface SimOutput {
  turnover: number;
  liabilities: number;
  payouts: number;
  grossProfit: number;
  netProfit: number;
  houseEdge: number;
  roi: number;
  worstLiability: number;
  largestPayout: number;
  probLoss: number;
  probProfit: number;
  // Monte Carlo
  avgProfit: number;
  medianProfit: number;
  bestProfit: number;
  worstProfit: number;
  ci95Low: number;
  ci95High: number;
  // Charts
  histogram: { bucket: string; count: number }[];
  weekly: { week: number; profit: number; cumulative: number }[];
  liabilityByMatch: { match: string; liability: number }[];
  reserves: { week: number; reserve: number }[];
  bankroll: { week: number; bankroll: number }[];
  // Risk
  recommendedBankroll: number;
  bankruptcyProb: number;
  maxDrawdown: number;
  expectedValue: number;
  largestSingleRisk: number;
  totalBets: number;
}

function rand() {
  return Math.random();
}

function pickStake(inp: SimInputs) {
  // triangular distribution around avg
  const u = rand();
  const c = (inp.avgStake - inp.minStake) / (inp.maxStake - inp.minStake);
  const v =
    u < c
      ? inp.minStake + Math.sqrt(u * (inp.maxStake - inp.minStake) * (inp.avgStake - inp.minStake))
      : inp.maxStake -
        Math.sqrt((1 - u) * (inp.maxStake - inp.minStake) * (inp.maxStake - inp.avgStake));
  return Math.max(inp.minStake, Math.min(inp.maxStake, v));
}

// True probability of each bet type (representative)
const TRUE_PROB: Record<BetType, number> = {
  match_winner: 0.38, // pick one of 3 outcomes
  double_chance: 0.67,
  over_under: 0.5,
  btts: 0.52,
  correct_score: 0.09,
  outright: 0.03125, // 1 of 32
};

function fairOdds(p: number) {
  return 1 / p;
}

function bookOdds(p: number, source: OddsSource, customMargin: number) {
  const margin =
    source === "real" ? 0.07 : source === "margin5" ? 0.05 : source === "margin10" ? 0.1 : customMargin / 100;
  // reduce odds by margin -> book pays less than fair
  return fairOdds(p) / (1 + margin);
}

function pickBetType(types: BetType[]): BetType {
  return types[Math.floor(rand() * types.length)];
}

function behaviourWinChance(behaviour: Behaviour, truth: number): number {
  // Returns probability that this bet actually wins.
  // Sharp bettors find edge; casual prefer favourites (skew slightly worse on value);
  // random ~= true probability.
  if (behaviour === "random") return truth;
  if (behaviour === "casual") return truth * 0.97;
  if (behaviour === "sharp") return truth * 1.06;
  // mixed
  const r = rand();
  if (r < 0.5) return truth;
  if (r < 0.8) return truth * 0.97;
  return truth * 1.06;
}

interface SingleRun {
  profit: number;
  weekly: number[];
  bankrollSeries: number[];
  maxDrawdown: number;
  worstLiability: number;
  largestPayout: number;
  totalBets: number;
  totalStake: number;
  totalPayout: number;
  totalLiability: number;
  liabilityByMatch: Record<string, number>;
  bankrupt: boolean;
}

function runOnce(inp: SimInputs): SingleRun {
  const weekly: number[] = [];
  const bankrollSeries: number[] = [inp.startingBankroll];
  let bankroll = inp.startingBankroll;
  let peak = bankroll;
  let maxDrawdown = 0;
  let worstLiability = 0;
  let largestPayout = 0;
  let totalBets = 0;
  let totalStake = 0;
  let totalPayout = 0;
  let totalLiability = 0;
  const liabilityByMatch: Record<string, number> = {};
  let bankrupt = false;

  for (let w = 0; w < inp.weeks; w++) {
    let weekProfit = 0;
    const bets = inp.betsPerWeek;
    for (let b = 0; b < bets; b++) {
      const stake = pickStake(inp);
      const type = pickBetType(inp.betTypes);
      const truth = TRUE_PROB[type];
      const odds = bookOdds(truth, inp.oddsSource, inp.customMargin);
      const liability = stake * (odds - 1);
      const matchId = `W${w + 1}-M${(b % 12) + 1}`;
      liabilityByMatch[matchId] = (liabilityByMatch[matchId] ?? 0) + liability;
      worstLiability = Math.max(worstLiability, liability);
      totalLiability += liability;
      totalStake += stake;
      totalBets++;

      const winChance = behaviourWinChance(inp.behaviour, truth);
      if (rand() < winChance) {
        const payout = stake * odds;
        weekProfit -= liability; // book loses liability (stake already collected)
        totalPayout += payout;
        largestPayout = Math.max(largestPayout, payout);
      } else {
        weekProfit += stake; // book keeps stake
      }
    }
    bankroll += weekProfit;
    weekly.push(weekProfit);
    bankrollSeries.push(bankroll);
    peak = Math.max(peak, bankroll);
    maxDrawdown = Math.max(maxDrawdown, peak - bankroll);
    if (bankroll < 0) bankrupt = true;
  }

  return {
    profit: bankroll - inp.startingBankroll,
    weekly,
    bankrollSeries,
    maxDrawdown,
    worstLiability,
    largestPayout,
    totalBets,
    totalStake,
    totalPayout,
    totalLiability,
    liabilityByMatch,
    bankrupt,
  };
}

export function runSimulation(inp: SimInputs): SimOutput {
  const N = Math.max(100, Math.min(20000, inp.iterations));
  const profits: number[] = new Array(N);
  let bankruptCount = 0;
  let lossCount = 0;
  let worstLiability = 0;
  let largestPayout = 0;
  let sumDrawdown = 0;
  let sumTurnover = 0;
  let sumPayout = 0;
  let sumLiability = 0;
  let sumBets = 0;
  let bestRun: SingleRun | null = null;
  let worstRun: SingleRun | null = null;
  const liabilityAgg: Record<string, number> = {};
  const weeklyAgg: number[] = new Array(inp.weeks).fill(0);
  const bankrollAgg: number[] = new Array(inp.weeks + 1).fill(0);

  for (let i = 0; i < N; i++) {
    const r = runOnce(inp);
    profits[i] = r.profit;
    if (r.bankrupt) bankruptCount++;
    if (r.profit < 0) lossCount++;
    worstLiability = Math.max(worstLiability, r.worstLiability);
    largestPayout = Math.max(largestPayout, r.largestPayout);
    sumDrawdown += r.maxDrawdown;
    sumTurnover += r.totalStake;
    sumPayout += r.totalPayout;
    sumLiability += r.totalLiability;
    sumBets += r.totalBets;
    if (!bestRun || r.profit > bestRun.profit) bestRun = r;
    if (!worstRun || r.profit < worstRun.profit) worstRun = r;
    for (const [k, v] of Object.entries(r.liabilityByMatch)) {
      liabilityAgg[k] = (liabilityAgg[k] ?? 0) + v;
    }
    for (let w = 0; w < inp.weeks; w++) weeklyAgg[w] += r.weekly[w];
    for (let w = 0; w <= inp.weeks; w++) bankrollAgg[w] += r.bankrollSeries[w];
  }

  const sorted = [...profits].sort((a, b) => a - b);
  const avg = profits.reduce((s, x) => s + x, 0) / N;
  const median = sorted[Math.floor(N / 2)];
  const ci95Low = sorted[Math.floor(N * 0.025)];
  const ci95High = sorted[Math.floor(N * 0.975)];

  // Histogram
  const min = sorted[0];
  const max = sorted[N - 1];
  const buckets = 24;
  const step = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, i) => {
    const lo = min + i * step;
    const hi = lo + step;
    const count = profits.filter((p) => p >= lo && (i === buckets - 1 ? p <= hi : p < hi)).length;
    return { bucket: `${Math.round(lo)}`, count };
  });

  const avgWeekly = weeklyAgg.map((s) => s / N);
  let cum = 0;
  const weekly = avgWeekly.map((p, i) => {
    cum += p;
    return { week: i + 1, profit: Math.round(p), cumulative: Math.round(cum) };
  });

  const avgBankroll = bankrollAgg.map((s) => s / N);
  const bankroll = avgBankroll.map((b, i) => ({ week: i, bankroll: Math.round(b) }));
  const reserves = avgBankroll.slice(1).map((b, i) => ({
    week: i + 1,
    reserve: Math.round(Math.max(0, inp.startingBankroll - b + sumLiability / N / inp.weeks)),
  }));

  const liabilityByMatch = Object.entries(liabilityAgg)
    .map(([match, liability]) => ({ match, liability: Math.round(liability / N) }))
    .sort((a, b) => b.liability - a.liability)
    .slice(0, 12);

  const turnover = sumTurnover / N;
  const payouts = sumPayout / N;
  const liabilities = sumLiability / N;
  const grossProfit = turnover - payouts;
  const netProfit = avg;
  const houseEdge = turnover > 0 ? (grossProfit / turnover) * 100 : 0;
  const roi = inp.startingBankroll > 0 ? (netProfit / inp.startingBankroll) * 100 : 0;

  // Recommended bankroll: cover 99th percentile drawdown + worst liability
  const drawdownSorted = sorted.map((p) => Math.max(0, -p)).sort((a, b) => a - b);
  const p99 = drawdownSorted[Math.floor(N * 0.99)] || 0;
  const recommendedBankroll = Math.round(p99 * 1.5 + worstLiability);

  return {
    turnover: Math.round(turnover),
    liabilities: Math.round(liabilities),
    payouts: Math.round(payouts),
    grossProfit: Math.round(grossProfit),
    netProfit: Math.round(netProfit),
    houseEdge: Math.round(houseEdge * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    worstLiability: Math.round(worstLiability),
    largestPayout: Math.round(largestPayout),
    probLoss: Math.round((lossCount / N) * 10000) / 100,
    probProfit: Math.round(((N - lossCount) / N) * 10000) / 100,
    avgProfit: Math.round(avg),
    medianProfit: Math.round(median),
    bestProfit: Math.round(sorted[N - 1]),
    worstProfit: Math.round(sorted[0]),
    ci95Low: Math.round(ci95Low),
    ci95High: Math.round(ci95High),
    histogram,
    weekly,
    liabilityByMatch,
    reserves,
    bankroll,
    recommendedBankroll,
    bankruptcyProb: Math.round((bankruptCount / N) * 10000) / 100,
    maxDrawdown: Math.round(sumDrawdown / N),
    expectedValue: Math.round(netProfit / Math.max(1, sumBets / N)),
    largestSingleRisk: Math.round(worstLiability),
    totalBets: Math.round(sumBets / N),
  };
}

export function runScenarios(base: SimInputs): ScenarioResult[] {
  const scenarios: Array<{ label: string; overrides: Partial<SimInputs> }> = [
    { label: "A: 100/wk, RM10-1000", overrides: { betsPerWeek: 100 } },
    { label: "B: 150/wk, RM10-1000", overrides: { betsPerWeek: 150 } },
    { label: "C: 150/wk, 10% margin", overrides: { betsPerWeek: 150, oddsSource: "margin10" } },
    {
      label: "D: 150/wk, no margin",
      overrides: { betsPerWeek: 150, oddsSource: "custom", customMargin: 0 },
    },
  ];
  return scenarios.map(({ label, overrides }) => {
    const inp: SimInputs = { ...base, ...overrides, iterations: 1000 };
    const out = runSimulation(inp);
    return {
      label,
      expectedProfit: out.avgProfit,
      expectedPayout: out.payouts,
      maxLiability: out.worstLiability,
      bankrollRequired: out.recommendedBankroll,
      chanceOfLoss: out.probLoss,
    };
  });
}
