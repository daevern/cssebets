import { Bell } from "lucide-react";

type Sport = {
  key: string;
  label: string;
  tagline: string;
  logo: string;
  tint: string; // rgba() for icon tile wash
  leagues?: { name: string; src: string }[];
};

const SPORTS: Sport[] = [
  {
    key: "football",
    label: "Football",
    tagline: "Premier League, La Liga, Serie A, UCL",
    logo: "https://www.google.com/s2/favicons?domain=fifa.com&sz=128",
    tint: "rgba(34,224,107,0.10)",
    leagues: [
      { name: "Premier League", src: "https://www.google.com/s2/favicons?domain=premierleague.com&sz=128" },
      { name: "La Liga", src: "https://www.google.com/s2/favicons?domain=laliga.com&sz=128" },
      { name: "Serie A", src: "https://www.google.com/s2/favicons?domain=legaseriea.it&sz=128" },
      { name: "Champions League", src: "https://www.google.com/s2/favicons?domain=uefa.com&sz=128" },
    ],
  },
  {
    key: "f1",
    label: "Formula 1",
    tagline: "Race winner, podium, constructors",
    logo: "https://www.google.com/s2/favicons?domain=formula1.com&sz=128",
    tint: "rgba(225,6,0,0.10)",
  },
  {
    key: "ufc",
    label: "UFC",
    tagline: "Moneyline, method, round betting",
    logo: "https://www.google.com/s2/favicons?domain=ufc.com&sz=128",
    tint: "rgba(212,162,74,0.10)",
  },
  {
    key: "nba",
    label: "NBA",
    tagline: "Spread, totals, player props",
    logo: "https://www.google.com/s2/favicons?domain=nba.com&sz=128",
    tint: "rgba(201,8,42,0.10)",
  },
];

export function SportCategoryGrid() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-2)]">
      {SPORTS.map((s, i) => (
        <div
          key={s.key}
          className={
            "group flex items-center gap-3 px-3.5 py-3 transition-colors " +
            (i > 0 ? "border-t border-[var(--surface-border)] " : "") +
            "hover:bg-white/[0.015]"
          }
        >
          {/* Icon tile */}
          <div
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.04]"
            style={{ background: s.tint }}
          >
            <img
              src={s.logo}
              alt=""
              aria-hidden
              className="h-6 w-6 rounded-md bg-white/95 object-contain p-0.5"
              loading="lazy"
            />
          </div>

          {/* Body */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[15px] font-semibold tracking-tight text-[var(--ink)]">
                {s.label}
              </h3>
              <span className="rounded-full border border-[var(--neon)]/25 bg-[var(--neon)]/[0.06] px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.09em] text-[var(--neon)]/90">
                Soon
              </span>
            </div>

            {s.leagues ? (
              <div className="mt-1.5 flex items-center gap-1.5">
                {s.leagues.map((l) => (
                  <img
                    key={l.name}
                    src={l.src}
                    alt=""
                    aria-hidden
                    title={l.name}
                    className="h-4 w-4 rounded bg-white/90 object-contain p-[1px]"
                    loading="lazy"
                  />
                ))}
                <span className="ml-1 truncate text-[11.5px] text-[var(--ink-muted)]">
                  {s.tagline}
                </span>
              </div>
            ) : (
              <p className="mt-0.5 truncate text-[11.5px] text-[var(--ink-muted)]">
                {s.tagline}
              </p>
            )}
          </div>

          {/* Action */}
          <button
            type="button"
            disabled
            aria-label={`Notify me when ${s.label} launches`}
            className="ml-1 inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] font-semibold tracking-tight text-[var(--ink-muted)] cursor-not-allowed"
          >
            <Bell className="h-3 w-3" />
            Notify
          </button>
        </div>
      ))}
    </div>
  );
}
