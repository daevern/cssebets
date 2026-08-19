import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

const NAV = [
  { to: "/about", label: "About" },
  { to: "/community", label: "Community" },
  { to: "/performance", label: "Performance" },
  { to: "/faq", label: "Help" },
] as const;

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

export function PublicPage({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <PublicHeader />

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[var(--surface-border)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(to right, var(--surface-border) 1px, transparent 1px), linear-gradient(to bottom, var(--surface-border) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage: "radial-gradient(120% 80% at 20% 0%, #000 20%, transparent 75%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full blur-[110px]"
            style={{ background: "rgba(var(--neon-glow-rgb), 0.20)" }}
          />
          <div className="relative mx-auto w-full max-w-5xl px-4 pb-10 pt-10 md:px-6 md:pb-16 md:pt-16">
            <div className="mb-4 inline-flex items-center gap-2 border border-[var(--surface-border)] bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-neon)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] shadow-[0_0_10px_var(--color-neon)]" />
              {eyebrow}
            </div>
            <h1 className="max-w-3xl text-[2rem] font-semibold leading-[1.05] tracking-tight md:text-[3.25rem]">
              {title}
            </h1>
            {lede && (
              <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[var(--ink-muted)] md:text-base">
                {lede}
              </p>
            )}
          </div>
        </section>

        <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10 md:px-6 md:py-14">
          {children}
          <CtaBanner />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

function PublicHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b border-[var(--surface-border)] bg-[var(--surface)]/90 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 md:h-16 md:px-6">
        <Link to="/" aria-label="CSSEBets home" className="shrink-0">
          <CsseLogo size={22} />
        </Link>

        <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              activeProps={{ className: "text-[var(--ink)] bg-[var(--surface-2)]" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/auth"
            className="rounded-full border border-[var(--surface-border)] px-3 py-1.5 text-[12px] font-semibold hover:border-[var(--color-neon)]/50 hover:text-[var(--color-neon)]"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-full bg-[var(--color-neon)] px-3 py-1.5 text-[12px] font-bold text-[#04140A] hover:shadow-[0_0_18px_var(--color-neon-glow)]"
          >
            Register
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-[var(--surface-border)] bg-[var(--surface-2)]">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-6">
        <div>
          <CsseLogo size={20} />
          <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--ink-muted)]">
            A closed community points club for sports markets and house originals. Points only —
            never stake more than you can afford to lose.
          </p>
        </div>
        <FooterCol
          title="Platform"
          links={[
            { to: "/about", label: "About" },
            { to: "/community", label: "Community" },
            { to: "/performance", label: "Performance" },
          ]}
        />
        <FooterCol
          title="Get started"
          links={[
            { to: "/faq", label: "Help & FAQ" },
            { to: "/register", label: "Create account" },
            { to: "/auth", label: "Log in" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { to: "/terms", label: "Terms of Service" },
            { to: "/privacy", label: "Privacy Policy" },
            { to: "/responsible-gambling", label: "Responsible Gambling" },
          ]}
        />
      </div>

      <div className="border-t border-[var(--surface-border)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4 font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-dim)] md:px-6">
          <span>
            © {new Date().getFullYear()} <BrandText />
          </span>
          <span>18+ · Play responsibly</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { to: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink-dim)]">
        {title}
      </div>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to as never}
              className="text-[13px] text-[var(--ink-muted)] hover:text-[var(--color-neon)]"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

export function Section({
  index,
  title,
  subtitle,
  children,
}: {
  index?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 border-b border-dashed border-[var(--surface-border)] pb-3">
        {index && (
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-[var(--color-neon)]">
            {index}
          </span>
        )}
        <h2 className="text-lg font-semibold tracking-tight md:text-xl">{title}</h2>
        {subtitle && (
          <span className="ml-auto hidden text-[12px] text-[var(--ink-dim)] md:block">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function Panel({
  title,
  kicker,
  children,
  accent,
}: {
  title?: string;
  kicker?: ReactNode;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "relative border bg-[var(--surface-2)] p-5 " +
        (accent
          ? "border-[var(--color-neon)]/35 shadow-[0_0_40px_-24px_var(--color-neon)]"
          : "border-[var(--surface-border)]")
      }
    >
      {kicker && (
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink-dim)]">
          {kicker}
        </div>
      )}
      {title && <h3 className="mb-2 text-[15px] font-semibold tracking-tight">{title}</h3>}
      <div className="space-y-3 text-[14px] leading-relaxed text-[var(--ink-muted)]">{children}</div>
    </div>
  );
}

export function StatStrip({
  items,
}: {
  items: { label: string; value: ReactNode; hint?: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden border border-[var(--surface-border)] bg-[var(--surface-border)] md:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-[var(--surface-2)] px-4 py-4">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink-dim)]">
            {s.label}
          </div>
          <div className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight text-[var(--ink)] md:text-2xl">
            {s.value}
          </div>
          {s.hint && <div className="mt-1 text-[11px] text-[var(--ink-muted)]">{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="grid gap-px overflow-hidden border border-[var(--surface-border)] bg-[var(--surface-border)] md:grid-cols-2">
      {items.map((s, i) => (
        <li key={s.title} className="bg-[var(--surface-2)] p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 font-mono text-[11px] font-bold text-[var(--color-neon)]">
              {i + 1}
            </span>
            <span className="text-[14px] font-semibold text-[var(--ink)]">{s.title}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--ink-muted)]">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function CtaBanner() {
  return (
    <section className="relative overflow-hidden border border-[var(--color-neon)]/30 bg-[var(--surface-2)] p-6 md:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-[90px]"
        style={{ background: "rgba(var(--neon-glow-rgb), 0.22)" }}
      />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight md:text-xl">
            Try it with 1,000 demo points
          </h2>
          <p className="mt-1 max-w-md text-[13px] text-[var(--ink-muted)]">
            Explore football, Formula 1, UFC and CSSE Originals in demo mode. Register when you
            want to join the club for real points.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            to="/dashboard"
            className="rounded-full border border-[var(--surface-border)] px-4 py-2 text-[12px] font-semibold hover:border-[var(--color-neon)]/50 hover:text-[var(--color-neon)]"
          >
            Open demo
          </Link>
          <Link
            to="/register"
            className="rounded-full bg-[var(--color-neon)] px-4 py-2 text-[12px] font-bold text-[#04140A] hover:shadow-[0_0_18px_var(--color-neon-glow)]"
          >
            Create account
          </Link>
        </div>
      </div>
    </section>
  );
}
