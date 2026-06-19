export type ChangelogEntry = {
  date: string; // ISO yyyy-mm-dd
  type: "feature" | "fix" | "improvement";
  title: string;
  body: string;
};

/* Hand-curated changelog. Add new entries at the top. Be specific and honest.
   Every entry should reflect a real shipped change. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-06-19",
    type: "feature",
    title: "Platform Pulse, activity feed, and Trust Center launched",
    body: "Homepage now shows real registered members, active members, bets placed, payouts paid, and average processing times — pulled live from the database, no synthetic numbers. Added a Trust Center, public Status page, and this changelog.",
  },
  {
    date: "2026-06-19",
    type: "improvement",
    title: "Unified dark scoreboard design across every page",
    body: "Wallet, Payout, Settings, Help, Picks, and Support pages now share the same stencil neon scoreboard aesthetic for a consistent experience.",
  },
  {
    date: "2026-06-19",
    type: "improvement",
    title: "Custom stencil icons across navigation",
    body: "Replaced generic icons with bespoke stencil illustrations in the cssebets visual language.",
  },
  {
    date: "2026-06-18",
    type: "improvement",
    title: "FIFA World Cup 2026 branding update",
    body: "Updated tournament references and refined the Matches and Bets surfaces.",
  },
  {
    date: "2026-06-17",
    type: "improvement",
    title: "Security hardening pass",
    body: "Resolved findings raised by automated security scans across server functions, RLS policies, and admin operations.",
  },
];
