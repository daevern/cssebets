import { Lock } from "lucide-react";

const SPORT_CATEGORIES = [
  {
    key: "football",
    label: "Football",
    logo: "https://www.google.com/s2/favicons?domain=fifa.com&sz=128",
    leagues: [
      { name: "Premier League", src: "https://www.google.com/s2/favicons?domain=premierleague.com&sz=128" },
      { name: "La Liga", src: "https://www.google.com/s2/favicons?domain=laliga.com&sz=128" },
      { name: "Serie A", src: "https://www.google.com/s2/favicons?domain=legaseriea.it&sz=128" },
      { name: "Champions League", src: "https://www.google.com/s2/favicons?domain=uefa.com&sz=128" },
    ],
  },
  { key: "f1", label: "Formula 1", logo: "https://www.google.com/s2/favicons?domain=formula1.com&sz=128" },
  { key: "ufc", label: "UFC", logo: "https://www.google.com/s2/favicons?domain=ufc.com&sz=128" },
  { key: "nba", label: "NBA", logo: "https://www.google.com/s2/favicons?domain=nba.com&sz=128" },
] as const;

export function SportCategoryGrid() {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {SPORT_CATEGORIES.map((s) => (
        <div
          key={s.key}
          className="relative overflow-hidden rounded-xl border border-[var(--neon)]/30 bg-[var(--surface-2)] p-3 shadow-[0_0_0_1px_rgba(34,224,107,0.06),0_0_18px_-8px_rgba(34,224,107,0.35)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 55% at 50% 0%, rgba(34,224,107,0.10), transparent 65%)",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[var(--surface)]/30 backdrop-blur-[1px]" />
          <div className="relative flex items-center gap-2">
            <img
              src={s.logo}
              alt={`${s.label} logo`}
              className="h-8 w-8 rounded-md object-contain bg-white/95 p-1"
              loading="lazy"
            />
            <span className="text-[13px] font-bold tracking-tight text-[var(--ink)]">{s.label}</span>
            <Lock className="ml-auto h-3.5 w-3.5 text-[var(--neon)]/70" />
          </div>
          {"leagues" in s && s.leagues ? (
            <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
              {s.leagues.map((l) => (
                <img
                  key={l.name}
                  src={l.src}
                  alt={`${l.name} logo`}
                  title={l.name}
                  className="h-6 w-6 rounded bg-white/95 object-contain p-1"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <div className="relative mt-3 h-6" />
          )}
        </div>
      ))}
    </div>
  );
}
