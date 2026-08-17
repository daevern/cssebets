import { Link } from "@tanstack/react-router";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";

const STEPS = [
  { label: "Account created", state: "done" as const, detail: "Your credentials are live." },
  { label: "Review in progress", state: "active" as const, detail: "A CSSEBets admin is verifying your account." },
  { label: "Markets unlocked", state: "todo" as const, detail: "Wallet, markets and arcade go live." },
];

/**
 * Kalshi-flavoured holding screen for accounts awaiting admin approval.
 * Quiet dark surface, a status ladder, and a preview of what unlocks.
 */
export function PendingApproval({
  email,
  onSignOut,
}: {
  email?: string | null;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[360px]"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(34,224,107,0.10), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-5 py-8">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <CsseAppIcon size={30} />
          <CsseWordmark size={16} />
        </Link>

        <div className="flex-1">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs font-medium text-[var(--color-neon)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
            Pending review
          </span>

          <h1 className="mt-4 text-[28px] font-semibold leading-tight tracking-tight">
            You're in the queue.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            CSSEBets reviews every new account by hand to keep the markets clean.
            {email ? ` We'll notify ${email} the moment you're approved.` : ""} It
            usually takes a few hours. If you upgraded from a demo session, your user
            id stays the same — practice tickets stay history; real points start at
            zero until approval.
          </p>

          {/* Status ladder */}
          <div className="mt-8 rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-5">
            <ol className="space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.label} className="relative flex gap-3.5">
                  {i < STEPS.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute left-[7px] top-5 h-full w-px bg-[var(--color-surface-border)]"
                    />
                  )}
                  <span
                    className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                      s.state === "done"
                        ? "border-[var(--color-neon)] bg-[var(--color-neon)]"
                        : s.state === "active"
                          ? "animate-pulse border-[var(--color-neon)] bg-transparent"
                          : "border-[var(--color-surface-border)] bg-transparent"
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        s.state === "todo"
                          ? "text-[var(--color-ink-muted)]"
                          : "text-[var(--color-ink)]"
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* What unlocks */}
          <p className="mt-8 text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            What unlocks on approval
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              { k: "Markets", v: "Football · F1 · UFC" },
              { k: "Arcade", v: "Provably fair games" },
              { k: "Wallet", v: "Top-ups & payouts" },
              { k: "Referrals", v: "Earn on invites" },
            ].map((t) => (
              <div
                key={t.k}
                className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4"
              >
                <p className="text-sm font-medium">{t.k}</p>
                <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">{t.v}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => window.location.reload()}
              className="h-11 flex-1 rounded-lg bg-[var(--color-neon)] text-[15px] font-semibold text-[#04140A] transition-opacity hover:opacity-90"
            >
              Check status
            </button>
            <button
              onClick={onSignOut}
              className="h-11 flex-1 rounded-lg border border-[var(--color-surface-border)] text-[15px] font-medium text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
            >
              Sign out
            </button>
          </div>
        </div>

        <p className="mt-10 text-xs text-[var(--color-ink-muted)]">
          Competitive Strategy Starts Everywhere
        </p>
      </div>
    </div>
  );
}
