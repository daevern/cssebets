import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Info, Users, LineChart, LifeBuoy, Wallet as WalletIcon, ChevronRight, ArrowUpRight } from "lucide-react";

import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { CategoryRail } from "@/components/nav/CategoryRail";

import { teamFlagUrl } from "@/lib/country-flags";
import { getGuestFeed, type GuestFootballMatch, type GuestF1Race } from "@/lib/guest-feed.functions";
import { listUfcFightsAll } from "@/lib/ufc.functions";
import { recordHomeView } from "@/lib/trust-public.functions";
import { GuestWalletSheet } from "@/components/wallet/GuestWalletSheet";
import { GuestAuthPrompt } from "@/components/auth/GuestAuthPrompt";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — Live sports prediction markets" },
      {
        name: "description",
        content:
          "Browse live football, F1 and UFC prediction markets. Explore odds, movement charts and analytics — sign up in seconds to place a bet.",
      },
      { property: "og:title", content: "CSSEBets — Live sports prediction markets" },
      {
        property: "og:description",
        content:
          "Browse live football, F1 and UFC prediction markets. Explore odds, movement charts and analytics — sign up in seconds to place a bet.",
      },
      { property: "og:url", content: "https://cssebets.com/" },
      { property: "og:image", content: "https://cssebets.com/og-image.jpg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: "https://cssebets.com/og-image.jpg" },
    ],
    links: [{ rel: "canonical", href: "https://cssebets.com/" }],
  }),
  component: LandingPage,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function timeChip(iso: string, now: number) {
  const d = new Date(iso);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today · ${t}`;
  const diffDays = Math.round((d.getTime() - now) / (24 * 3600_000));
  if (diffDays > 0 && diffDays <= 7) {
    return `${d.toLocaleDateString(undefined, { weekday: "short" })} · ${t}`;
  }
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${t}`;
}

function CountryFlag({ name, w = 26, h = 18 }: { name?: string | null; w?: number; h?: number }) {
  const url = name ? teamFlagUrl(name, 160) : null;
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[9px] font-bold uppercase text-[var(--ink)]"
        style={{ width: w, height: h }}
      >
        {(name ?? "").slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name ?? ""}
      className="object-cover"
      style={{ width: w, height: h }}
      loading="lazy"
    />
  );
}

function Portrait({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-3)] object-cover"
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <div
      className="grid place-items-center rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-3)] text-[11px] font-bold text-[var(--ink)]"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

type SportTab = "football" | "f1" | "ufc";

function LandingPage() {
  const trackView = useServerFn(recordHomeView);
  useEffect(() => {
    trackView({}).catch(() => {});
  }, [trackView]);

  const feedFn = useServerFn(getGuestFeed);
  const ufcFn = useServerFn(listUfcFightsAll);

  const feedQ = useQuery({
    queryKey: ["guest-feed"],
    queryFn: () => feedFn(),
    refetchInterval: 60_000,
  });
  const ufcQ = useQuery({
    queryKey: ["guest-ufc"],
    queryFn: () => ufcFn(),
    refetchInterval: 60_000,
  });

  const [tab, setTab] = useState<SportTab>("football");
  const [walletOpen, setWalletOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const now = useTicker(30_000);

  const football = feedQ.data?.football ?? [];
  const f1 = feedQ.data?.f1 ?? [];
  const ufc = useMemo(() => {
    const rows = ufcQ.data?.fights ?? [];
    const upcomingCutoff = Date.now() - 3 * 3600_000;
    return rows
      .filter((f: any) => new Date(f.commence_time).getTime() >= upcomingCutoff)
      .slice(0, 12);
  }, [ufcQ.data]);

  return (
    <div className="relative min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <header
        className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--surface)]/95 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-8">
          <Link to="/" aria-label="CSSEBets home" className="shrink-0">
            <CsseLogo size={22} />
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/auth"
              className="rounded-full border border-[var(--color-surface-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--neon)]/50 hover:text-[var(--neon)] sm:px-4 sm:py-2 sm:text-[13px]"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-[var(--neon)] px-3 py-1.5 text-[12px] font-bold text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)] sm:px-4 sm:py-2 sm:text-[13px]"
            >
              Register
            </Link>
          </div>
        </div>
        <CategoryRail />
      </header>

      <main className="mx-auto w-full min-w-0 max-w-3xl overflow-x-hidden px-4 pb-28 pt-5 md:pb-14">
        {/* Guest demo banner */}
        <div className="mb-4 rounded-xl border border-[var(--neon)]/30 bg-[var(--neon)]/5 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--neon)]">
                Demo mode
              </div>
              <div className="mt-0.5 text-[13px] text-[var(--ink)]">
                Browse live markets freely — create a free account to place a bet.
              </div>
            </div>
            <Link
              to="/register"
              className="shrink-0 rounded-full bg-[var(--neon)] px-3 py-1.5 text-[11px] font-bold text-[#04140A]"
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Sport tabs */}
        <div className="mb-4 flex gap-1.5 rounded-full border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-1">
          {(["football", "f1", "ufc"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-2 text-[12px] font-bold uppercase tracking-[0.14em] transition-colors ${
                tab === t
                  ? "bg-[var(--neon)] text-[#04140A]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {t === "football" ? "Football" : t === "f1" ? "Formula 1" : "UFC"}
            </button>
          ))}
        </div>

        {tab === "football" && (
          <FootballList
            matches={football}
            now={now}
            onBet={() => setAuthOpen(true)}
          />
        )}
        {tab === "f1" && <F1List races={f1} now={now} onBet={() => setAuthOpen(true)} />}
        {tab === "ufc" && <UfcList fights={ufc} now={now} onBet={() => setAuthOpen(true)} />}

        <footer className="mt-10 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          <Link to="/" className="flex items-center gap-2 hover:text-[var(--ink)]">
            <CsseLogo size={16} />
          </Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </main>

      <LandingBottomNav onWallet={() => setWalletOpen(true)} />
      <GuestWalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} />
      <GuestAuthPrompt open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Football list                                                       */
/* ------------------------------------------------------------------ */

function FootballList({
  matches,
  now,
  onBet,
}: {
  matches: GuestFootballMatch[];
  now: number;
  onBet: () => void;
}) {
  if (!matches.length) {
    return (
      <EmptyState label="No football fixtures currently available." />
    );
  }
  return (
    <section className="space-y-2.5">
      <SectionHeader title="Football markets" />
      {matches.map((m) => (
        <div
          key={m.id}
          className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4"
        >
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <span>{m.stage ?? "Football"}</span>
            <span>{m.status === "live" ? <LiveDot /> : timeChip(m.kickoffAt, now)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <TeamCell name={m.homeTeam} />
            <span className="text-[10px] font-bold text-[var(--ink-muted)]">vs</span>
            <TeamCell name={m.awayTeam} align="end" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <OddsPill label="Home" odds={m.homeOdds} onClick={onBet} tone="home" />
            <OddsPill label="Draw" odds={m.drawOdds} onClick={onBet} tone="draw" />
            <OddsPill label="Away" odds={m.awayOdds} onClick={onBet} tone="away" />
          </div>
        </div>
      ))}
    </section>
  );
}

function TeamCell({ name, align = "start" }: { name: string; align?: "start" | "end" }) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === "end" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <CountryFlag name={name} w={28} h={20} />
      <div className="truncate text-[13px] font-bold tracking-tight">{name}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* F1 list                                                             */
/* ------------------------------------------------------------------ */

function F1List({
  races,
  now,
  onBet,
}: {
  races: GuestF1Race[];
  now: number;
  onBet: () => void;
}) {
  if (!races.length) {
    return <EmptyState label="No upcoming Grands Prix." />;
  }
  return (
    <section className="space-y-2.5">
      <SectionHeader title="Formula 1 races" />
      {races.map((r) => {
        const live = r.status === "in_progress";
        return (
          <div
            key={r.id}
            className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4"
          >
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <span>Round {r.round}</span>
              <span>{live ? <LiveDot /> : timeChip(r.starts_at, now)}</span>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <CountryFlag name={r.country} w={40} h={28} />
              <div className="min-w-0">
                <div className="font-display truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">
                  {r.name}
                </div>
                {r.circuit && (
                  <div className="truncate text-[11px] text-[var(--ink-muted)]">{r.circuit}</div>
                )}
              </div>
            </div>
            {r.topDriver ? (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
                    Race-winner favourite
                  </div>
                  <div className="text-[14px] font-bold text-[var(--ink)]">{r.topDriver.name}</div>
                </div>
                <button
                  onClick={onBet}
                  className="rounded-lg border border-[var(--neon)]/50 bg-[var(--neon)]/10 px-3 py-2 text-[13px] font-bold tabular-nums text-[var(--neon)] hover:bg-[var(--neon)]/20"
                >
                  {r.topDriver.odds.toFixed(2)}
                </button>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-[var(--color-surface-border)] bg-[var(--surface-3)]/40 p-3 text-[11px] text-[var(--ink-muted)]">
                Odds go live once the paddock arrives.
              </div>
            )}
            <button
              onClick={onBet}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--neon)]/40 bg-[var(--neon)]/5 py-2.5 text-[13px] font-bold text-[var(--neon)] hover:bg-[var(--neon)]/10"
            >
              View all markets <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* UFC list                                                            */
/* ------------------------------------------------------------------ */

function UfcList({
  fights,
  now,
  onBet,
}: {
  fights: any[];
  now: number;
  onBet: () => void;
}) {
  if (!fights.length) {
    return <EmptyState label="No UFC fights on the card right now." />;
  }
  return (
    <section className="space-y-2.5">
      <SectionHeader title="UFC fights" />
      {fights.map((f) => {
        const ml = (f.markets ?? []).filter((m: any) => m.market_type === "moneyline");
        const oddsA = ml.find((m: any) => m.selection_key === "fighter_a")?.odds;
        const oddsB = ml.find((m: any) => m.selection_key === "fighter_b")?.odds;
        return (
          <div
            key={f.id}
            className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4"
          >
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
              <span>
                {f.event_name ?? "UFC"} · {(f.card_position ?? "").replace("_", "-")}
              </span>
              <span>{timeChip(f.commence_time, now)}</span>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <FighterCell
                name={f.fighter_a}
                photo={f.fighter_a_logo}
                country={f.fighter_a_country}
              />
              <div className="text-[10px] font-bold text-[var(--ink-muted)]">vs</div>
              <FighterCell
                name={f.fighter_b}
                photo={f.fighter_b_logo}
                country={f.fighter_b_country}
                align="end"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <OddsPill
                label={f.fighter_a?.split(" ").slice(-1)[0] ?? "A"}
                odds={oddsA != null ? Number(oddsA) : null}
                onClick={onBet}
                tone="home"
              />
              <OddsPill
                label={f.fighter_b?.split(" ").slice(-1)[0] ?? "B"}
                odds={oddsB != null ? Number(oddsB) : null}
                onClick={onBet}
                tone="away"
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

function FighterCell({
  name,
  photo,
  country,
  align = "start",
}: {
  name: string;
  photo?: string | null;
  country?: string | null;
  align?: "start" | "end";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${
        align === "end" ? "flex-row-reverse text-right" : ""
      }`}
    >
      {photo ? (
        <Portrait url={photo} name={name} size={40} />
      ) : (
        <div className="h-10 w-10 overflow-hidden rounded-full border border-[var(--color-surface-border)]">
          <CountryFlag name={country} w={40} h={40} />
        </div>
      )}
      <div className="truncate text-[13px] font-bold tracking-tight">{name}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="flex items-center gap-2 pb-1 text-[13px] font-bold tracking-tight text-[var(--ink)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
      {title}
    </h2>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-surface-border)] bg-[var(--surface-2)] p-8 text-center text-sm text-[var(--ink-muted)]">
      {label}
    </div>
  );
}

function LiveDot() {
  return (
    <span className="inline-flex items-center gap-1 text-rose-400">
      <span className="h-1 w-1 animate-pulse rounded-full bg-rose-500" /> LIVE
    </span>
  );
}

function OddsPill({
  label,
  odds,
  onClick,
  tone,
}: {
  label: string;
  odds: number | null;
  onClick: () => void;
  tone: "home" | "draw" | "away";
}) {
  const color =
    tone === "home"
      ? "text-rose-400 border-rose-400/30 hover:bg-rose-400/10"
      : tone === "draw"
      ? "text-sky-300 border-sky-300/30 hover:bg-sky-300/10"
      : "text-[var(--neon)] border-[var(--neon)]/40 hover:bg-[var(--neon)]/10";
  return (
    <button
      onClick={onClick}
      disabled={odds == null}
      className={`flex flex-col items-center gap-0.5 rounded-lg border bg-[var(--surface-3)]/40 px-2 py-2 transition-colors disabled:opacity-40 ${color}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        {label}
      </span>
      <span className="font-mono text-[14px] font-bold tabular-nums">
        {odds != null ? odds.toFixed(2) : "—"}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom nav                                                          */
/* ------------------------------------------------------------------ */

function LandingBottomNav({ onWallet }: { onWallet: () => void }) {
  type NavItem = {
    key: string;
    label: string;
    Icon: typeof WalletIcon;
    to?: string;
    onClick?: () => void;
  };
  const items: NavItem[] = [
    { key: "wallet", label: "Wallet", Icon: WalletIcon, onClick: onWallet },
    { key: "about", label: "About", Icon: Info, to: "/about" },
    { key: "community", label: "Community", Icon: Users, to: "/community" },
    { key: "performance", label: "Performance", Icon: LineChart, to: "/performance" },
    { key: "help", label: "Help", Icon: LifeBuoy, to: "/faq" },
  ];
  return (
    <nav
      aria-label="Landing sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)]/70 bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ key, label, Icon, to, onClick }) =>
          to ? (
            <Link
              key={key}
              to={to}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight text-[var(--ink-muted)] transition-colors hover:text-[var(--neon)]"
            >
              <Icon className="h-[22px] w-[22px]" />
              <span>{label}</span>
            </Link>
          ) : (
            <button
              key={key}
              onClick={onClick}
              className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight text-[var(--ink-muted)] transition-colors hover:text-[var(--neon)]"
            >
              <Icon className="h-[22px] w-[22px]" />
              <span>{label}</span>
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
