import { createFileRoute, Link } from "@tanstack/react-router";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CSSEBets" },
      { name: "description", content: "What CSSEBets is, how it works, and who it's for." },
      { property: "og:title", content: "About CSSEBets" },
      { property: "og:description", content: "What CSSEBets is, how it works, and who it's for." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicShell title="About" kicker="What is CSSEBets?">
      <p>
        <BrandText /> is a prediction market for the FIFA World Cup 2026. Players stake
        prediction points on match outcomes across a wide catalogue of markets — match
        result, over/under, both teams to score, corners, cards, correct score, and more.
      </p>
      <p>
        Odds are sourced from a global bookmaker feed and updated in near real-time. Every
        stake, settlement, and payout is auditable in the player's wallet history.
      </p>
      <h3>How to get started</h3>
      <ol>
        <li>Register a free account.</li>
        <li>Request points to fund your wallet.</li>
        <li>Open a fixture, pick a market, lock a prediction.</li>
        <li>Winning bets credit your wallet automatically at full time.</li>
      </ol>
    </PublicShell>
  );
}

export function PublicShell({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 md:h-16">
          <Link to="/" aria-label="CSSEBets home" className="shrink-0">
            <CsseLogo size={22} />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              className="rounded-full border border-[var(--color-surface-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink)] hover:border-[var(--color-neon)]/50 hover:text-[var(--color-neon)]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-[var(--color-neon)] px-3 py-1.5 text-[12px] font-bold text-[#04140A] hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
            >
              Register
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
        {kicker && (
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            {kicker}
          </div>
        )}
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight text-[var(--color-ink)] md:text-4xl">
          {title}
        </h1>
        <article className="prose prose-invert max-w-none space-y-4 text-sm leading-relaxed text-[var(--color-ink)] [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:text-[var(--color-ink-muted)]">
          {children}
        </article>
        <footer className="mt-10 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          <Link to="/" className="flex items-center gap-2 hover:text-[var(--color-ink)]">
            <CsseLogo size={16} />
          </Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </main>
    </div>
  );
}
