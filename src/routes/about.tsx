import { createFileRoute, Link } from "@tanstack/react-router";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — CSSEBets" },
      {
        name: "description",
        content:
          "CSSEBets is a closed community points club for sports markets and house arcade — who it's for and how it works.",
      },
      { property: "og:title", content: "About CSSEBets" },
      {
        property: "og:description",
        content:
          "CSSEBets is a closed community points club for sports markets and house arcade — who it's for and how it works.",
      },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/about" }],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PublicShell title="About" kicker="Who this is for">
      <p>
        <BrandText /> is a <strong>closed community points club</strong> built around the FIFA
        World Cup 2026 and ongoing football, Formula 1 and UFC. Members stake{" "}
        <strong>community points</strong> — not a public casino deposit product — on live markets
        and house arcade games from one wallet.
      </p>

      <h3>Who it's for</h3>
      <ul>
        <li>Members of a private sports community who want shared tipping and arcade play.</li>
        <li>Players who want live odds, clear settlements, and an auditable points wallet.</li>
        <li>Guests who want to try the app with practice points before joining as a member.</li>
      </ul>

      <h3>What you can do</h3>
      <ul>
        <li>
          <strong>Sports markets</strong> — football, F1 and UFC fixtures with match result,
          totals, BTTS and more, priced from a live odds feed.
        </li>
        <li>
          <strong>CSSE Originals</strong> — house arcade games (Plinko, Roulette, Blackjack, Keno,
          Crash and more) that are server-authoritative and provably fair.
        </li>
        <li>
          <strong>One wallet</strong> — every stake, settlement and payout shows in your history.
        </li>
      </ul>

      <h3>How to get started</h3>
      <ol>
        <li>Open the app as a guest (practice points) or register for a member account.</li>
        <li>Fund or reset your points wallet as your community rules allow.</li>
        <li>Lock a sports prediction or play a CSSE Original from the arcade.</li>
        <li>Winning settlements credit your wallet automatically.</li>
      </ol>

      <p className="text-[var(--color-ink-muted)]">
        <BrandText /> is for community play with points. Only stake what you can afford to lose.
      </p>
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
      <header
        className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--surface)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
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
          <span>
            © {new Date().getFullYear()} <BrandText />
          </span>
        </footer>
      </main>
    </div>
  );
}
