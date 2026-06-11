// Fetch World Cup 2026 matchday 1 fixtures + reference odds.
// Server-only. Used by simulation seeding to replace generic fake teams.

const FD_ENDPOINT =
  "https://api.football-data.org/v4/competitions/WC/matches?matchday=1";
const ODDS_ENDPOINT =
  "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds" +
  "?regions=eu&markets=h2h&oddsFormat=decimal";

const TEAM_ALIASES: Record<string, string> = {
  czechia: "czechrepublic",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  southkorea: "korearepublic",
  korea: "korearepublic",
  republicofkorea: "korearepublic",
  ivorycoast: "cotedivoire",
  capeverde: "caboverde",
  bosniaherzegovina: "bosniaandherzegovina",
  drcongo: "congodr",
  congodemocraticrepublic: "congodr",
};

function normalize(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[base] ?? base;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type WCFixture = {
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  group_name: string | null;
  stage: string | null;
  reference_odds: { home: number; draw: number; away: number };
  odds_source: "the-odds-api" | "fallback";
  raw_bookmaker_count: number | null;
};

function fallbackOdds() {
  return {
    home: +(1.5 + Math.random() * 3).toFixed(2),
    draw: +(2.8 + Math.random() * 2.2).toFixed(2),
    away: +(1.5 + Math.random() * 3).toFixed(2),
  };
}

export async function fetchWorldCupMatchday1Fixtures(): Promise<{
  fixtures: WCFixture[];
  warning?: string;
}> {
  const fdKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!fdKey) {
    return { fixtures: [], warning: "FOOTBALL_DATA_API_KEY not set" };
  }

  const fdRes = await fetch(FD_ENDPOINT, { headers: { "X-Auth-Token": fdKey } });
  if (!fdRes.ok) {
    return { fixtures: [], warning: `football-data ${fdRes.status}` };
  }
  const fdJson = (await fdRes.json()) as { matches?: any[] };
  const fdMatches = fdJson.matches ?? [];

  // Optional odds lookup
  const oddsKey = process.env.ODDS_API_KEY?.trim();
  let oddsEvents: any[] = [];
  if (oddsKey) {
    try {
      const oRes = await fetch(`${ODDS_ENDPOINT}&apiKey=${oddsKey}`);
      if (oRes.ok) oddsEvents = await oRes.json();
    } catch {
      // ignore — fallback odds will be used
    }
  }

  const fixtures: WCFixture[] = fdMatches.map((m) => {
    const home = m.homeTeam?.name ?? "TBD";
    const away = m.awayTeam?.name ?? "TBD";
    const h = normalize(home);
    const a = normalize(away);

    let reference_odds = fallbackOdds();
    let odds_source: WCFixture["odds_source"] = "fallback";
    let bookmakerCount: number | null = null;

    const ev = oddsEvents.find((e) => {
      const eh = normalize(e.home_team);
      const ea = normalize(e.away_team);
      return (eh === h && ea === a) || (eh === a && ea === h);
    });
    if (ev) {
      const homePrices: number[] = [];
      const drawPrices: number[] = [];
      const awayPrices: number[] = [];
      for (const bm of ev.bookmakers ?? []) {
        const market = bm.markets?.find((mk: any) => mk.key === "h2h");
        if (!market) continue;
        for (const o of market.outcomes) {
          const n = normalize(o.name);
          if (n === normalize(ev.home_team)) homePrices.push(o.price);
          else if (n === normalize(ev.away_team)) awayPrices.push(o.price);
          else if (n === "draw") drawPrices.push(o.price);
        }
      }
      if (homePrices.length && drawPrices.length && awayPrices.length) {
        reference_odds = {
          home: +median(homePrices).toFixed(2),
          draw: +median(drawPrices).toFixed(2),
          away: +median(awayPrices).toFixed(2),
        };
        odds_source = "the-odds-api";
        bookmakerCount = ev.bookmakers?.length ?? null;
      }
    }

    return {
      home_team: home,
      away_team: away,
      home_crest: m.homeTeam?.crest ?? null,
      away_crest: m.awayTeam?.crest ?? null,
      group_name: m.group ?? null,
      stage: m.stage
        ? `FIFA World Cup 2026 · ${m.stage}`
        : "FIFA World Cup 2026",
      reference_odds,
      odds_source,
      raw_bookmaker_count: bookmakerCount,
    };
  });

  return { fixtures };
}
