import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Check, Share2, Users2, Sparkles, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { getMyReferralOverview } from "@/lib/referrals.functions";
import { buildReferralLink } from "@/lib/referral-link";
import { useAuth } from "@/hooks/use-auth";

/**
 * Confident, custom referral panel for the profile page.
 * Big monospace code, share/copy actions, milestone rail, and a link
 * through to the full referrals dashboard.
 */
export function ReferralPanel() {
  const { user } = useAuth();
  const uid = user?.id ?? "anon";
  const rFn = useServerFn(getMyReferralOverview);
  const referral = useQuery({
    queryKey: ["referral-overview", uid],
    queryFn: () => rFn(),
    staleTime: 30_000,
    enabled: !!user,
  });

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const code = referral.data?.referralCode ?? null;
  const link = buildReferralLink(code);

  async function copy(value: string, which: "code" | "link", label: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const shareText = `Join me on CSSEBets — predict the World Cup 2026 together. Use my referral code: ${code ?? ""}. ${link}`;
  const shareHref = link ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : "#";

  const total = referral.data?.totalReferrals ?? 0;
  const active = referral.data?.activeReferrals ?? 0;
  const tokens = referral.data?.tokensEarned ?? 0;
  const pending = referral.data?.pendingMilestones ?? 0;

  return (
    <section
      aria-labelledby="referral-panel"
      className="relative overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-gradient-to-br from-[#070D0A] to-[#0A1611] p-5 md:p-6"
    >
      {/* Corner brackets */}
      <span aria-hidden className="pointer-events-none absolute top-3 left-3 h-2.5 w-2.5 border-t border-l border-[var(--neon)]/70" />
      <span aria-hidden className="pointer-events-none absolute top-3 right-3 h-2.5 w-2.5 border-t border-r border-[var(--neon)]/70" />
      <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 h-2.5 w-2.5 border-b border-l border-[var(--neon)]/70" />
      <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 h-2.5 w-2.5 border-b border-r border-[var(--neon)]/70" />

      {/* Neon halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(34,224,107,0.25), transparent 65%)" }}
      />

      <div className="relative">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--neon)]">
          <Sparkles className="h-3 w-3" />
          <span id="referral-panel">Referral roster</span>
        </div>
        <h3 className="mt-2 font-display text-2xl font-black leading-tight text-[var(--ink)]">
          Sign the squad.
          <br />
          <span className="text-[var(--neon)]">Cash the tokens.</span>
        </h3>
        <p className="mt-1.5 text-[12px] text-[var(--ink-muted)]">
          Every friend that plays through your code moves a milestone. Milestones pay CSSE tokens straight to your vault.
        </p>

        {/* Big code plate */}
        <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
          <div className="relative overflow-hidden rounded-xl border border-dashed border-[var(--neon)]/40 bg-black/40 px-4 py-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--ink-muted)]">
              Your code
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-2xl font-black tracking-[0.18em] text-[var(--neon)]">
                {code ?? "— — — —"}
              </span>
              <button
                type="button"
                onClick={() => code && copy(code, "code", "Code")}
                disabled={!code}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--color-surface-border)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink)] transition-colors hover:border-[var(--neon)]/60 disabled:opacity-40"
              >
                {copied === "code" ? <Check className="h-3 w-3 text-[var(--neon)]" /> : <Copy className="h-3 w-3" />}
                {copied === "code" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { if (!code) e.preventDefault(); }}
            aria-disabled={!code}
            className="grid place-items-center rounded-xl border border-[var(--neon)]/50 bg-[var(--neon)] px-4 text-black shadow-[0_0_18px_var(--color-neon-glow)] transition-all hover:brightness-110 aria-disabled:opacity-40 aria-disabled:shadow-none"
            aria-label="Share referral on WhatsApp"
          >
            <Share2 className="h-5 w-5" />
          </a>
        </div>

        {/* Full link row */}
        <button
          type="button"
          onClick={() => link && copy(link, "link", "Link")}
          disabled={!link}
          className="mt-2 flex w-full items-center gap-2 truncate rounded-lg border border-[var(--color-surface-border)] bg-black/30 px-3 py-2 text-left text-[11px] text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/50 disabled:opacity-40"
        >
          <span className="truncate font-mono">{link || "Waiting for your code…"}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--neon)]">
            {copied === "link" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied === "link" ? "Copied" : "Copy link"}
          </span>
        </button>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <MiniStat label="Signed" value={total} />
          <MiniStat label="Active" value={active} accent />
          <MiniStat label="Tokens" value={tokens} accent />
        </div>

        <Link
          to="/referrals"
          className="mt-4 flex items-center justify-between rounded-xl border border-[var(--color-surface-border)] bg-black/30 px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ink)] transition-colors hover:border-[var(--neon)]/50"
        >
          <span className="flex items-center gap-2">
            <Users2 className="h-3.5 w-3.5 text-[var(--neon)]" />
            Open referral dashboard
            {pending > 0 && (
              <span className="ml-1 rounded-full border border-[var(--neon)]/40 bg-[var(--neon)]/10 px-1.5 py-0.5 text-[9px] font-bold tracking-normal text-[var(--neon)]">
                {pending} milestone{pending === 1 ? "" : "s"} pending
              </span>
            )}
          </span>
          <ArrowUpRight className="h-4 w-4 text-[var(--ink-muted)]" />
        </Link>
      </div>
    </section>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-border)] bg-black/30 p-3">
      <div className={`font-display text-xl font-black tabular-nums leading-none ${accent ? "text-[var(--neon)]" : "text-[var(--ink)]"}`}>
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--ink-muted)]">
        {label}
      </div>
    </div>
  );
}
