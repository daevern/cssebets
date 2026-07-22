import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, User, ShoppingBag, X, Copy, Check, LogOut, Info, Users, Activity, HelpCircle } from "lucide-react";
import { TokenVaultSheet } from "@/components/engagement/TokenVault";
import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getMyEngagementSummary } from "@/lib/engagement.functions";
import { getMyReferralOverview } from "@/lib/referrals.functions";

/**
 * Mobile-only condensed menu.
 * Trigger: 3-line hamburger (2 white, 1 green).
 * Panel: SVG-goo liquid-drop expansion into a full-height, 3/4-width green overlay.
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user?.id ?? "anon";

  const eFn = useServerFn(getMyEngagementSummary);
  const rFn = useServerFn(getMyReferralOverview);
  const tokensQ = useQuery({
    queryKey: ["engagement-summary", uid],
    queryFn: () => eFn(),
    staleTime: 30_000,
    enabled: !!user && open,
  });
  const refQ = useQuery({
    queryKey: ["my-referrals", uid],
    queryFn: () => rFn(),
    staleTime: 60_000,
    enabled: !!user && open,
  });

  const tokens = tokensQ.data?.tokens.balance ?? 0;
  const refCode = refQ.data?.referralCode ?? "";
  const isGuest = !user || (user as any)?.is_anonymous === true;
  const displayCode = isGuest ? "XXXXXXX" : refCode;

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 220);
  };

  async function copyCode() {
    if (!refCode) return;
    try {
      await navigator.clipboard.writeText(refCode);
      setCopied(true);
      toast.success("Referral code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function handleSignOut() {
    setOpen(false);
    try {
      await supabase.auth.signOut();
      navigate({ to: "/auth" });
    } catch {
      toast.error("Sign out failed");
    }
  }

  const TokenMark = (props: React.ComponentProps<typeof CsseMark>) => <CsseMark {...props} outline />;

  const items = [
    { key: "store", label: "Store", Icon: ShoppingBag, onClick: () => pick(() => navigate({ to: "/store" })) },
    { key: "tokens", label: "Tokens", Icon: TokenMark, onClick: () => pick(() => setTokensOpen(true)) },
    { key: "notifications", label: "Alerts", Icon: Bell, onClick: () => pick(() => navigate({ to: "/notifications" })) },
    { key: "profile", label: "Profile", Icon: User, onClick: () => pick(() => navigate({ to: "/settings" })) },
    ...(isGuest
      ? [
          { key: "about", label: "About", Icon: Info, onClick: () => pick(() => navigate({ to: "/about" })) },
          { key: "community", label: "Community", Icon: Users, onClick: () => pick(() => navigate({ to: "/community" })) },
          { key: "performance", label: "Performance", Icon: Activity, onClick: () => pick(() => navigate({ to: "/performance" })) },
          { key: "help", label: "Help", Icon: HelpCircle, onClick: () => pick(() => navigate({ to: "/faq" })) },
        ]
      : []),
  ] as const;

  return (
    <>
      {/* SVG goo filter */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id="csse-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Trigger — 3 line hamburger (2 white, 1 green) */}
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative z-[60] grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)]/70 bg-[var(--surface-2)] transition-colors hover:border-[var(--neon)]/50"
      >
        <span className="relative block h-3.5 w-4">
          <span
            className={`absolute left-0 h-[2px] w-full rounded-full bg-white transition-all duration-300 ${
              open ? "top-1/2 -translate-y-1/2 rotate-45" : "top-0"
            }`}
          />
          <span
            className={`absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-white transition-all duration-200 ${
              open ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`absolute left-0 h-[2px] w-full rounded-full bg-[var(--neon)] transition-all duration-300 ${
              open ? "top-1/2 -translate-y-1/2 -rotate-45 bg-white" : "bottom-0"
            }`}
          />
        </span>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              onClick={() => setOpen(false)}
              className={`fixed inset-0 z-[55] bg-black/40 transition-opacity duration-300 md:hidden ${
                open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
              style={{ backdropFilter: "blur(2px)" }}
              aria-hidden
            />

            {/* Liquid panel — full height, 3/4 width, right-anchored */}
            <div
              className={`fixed right-0 top-0 z-[58] h-[100dvh] w-3/4 md:hidden ${
                open ? "pointer-events-auto" : "pointer-events-none"
              }`}
              style={{ filter: "url(#csse-goo)" }}
            >
              {/* Drip drops */}
              <span
                aria-hidden
                className={`absolute right-4 top-4 block h-10 w-10 rounded-full bg-[var(--neon)] transition-all duration-300 ${
                  open ? "scale-100 opacity-100" : "scale-0 opacity-0"
                }`}
              />
              <span
                aria-hidden
                className={`absolute right-8 top-16 block h-8 w-8 rounded-full bg-[var(--neon)] transition-all duration-500 ${
                  open ? "scale-100 opacity-100 delay-75" : "scale-0 opacity-0"
                }`}
              />

              {/* Main blob — no rounded edges */}
              <div
                className={`absolute inset-0 origin-top-right bg-[var(--neon)] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] transition-all duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
                  open ? "opacity-100 scale-100" : "opacity-0 scale-[0.15]"
                }`}
              />

              {/* Content layer */}
              <div
                className={`relative flex h-full flex-col px-6 transition-opacity duration-300 ${
                  open ? "opacity-100 delay-200" : "opacity-0"
                }`}
                style={{
                  paddingTop: "calc(env(safe-area-inset-top) + 20px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
                  filter: "none",
                }}
              >
                {/* Header: brand + close */}
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-baseline">
                    <CsseMark className="mr-1.5 h-5 w-5 self-center text-black" outline />
                    <CsseWordmark size={16} inverse outline />
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="grid h-9 w-9 place-items-center bg-black/10 text-black transition-colors hover:bg-black/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Token balance display (read-only, wallet-style) */}
                <div className="mt-5 flex items-center justify-between bg-black/10 px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-black text-[var(--neon)]">
                      <CsseMark className="h-4 w-4" outline />
                    </span>
                    <div className="flex flex-col leading-tight">
                      <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-black/60">
                        Tokens
                      </span>
                      <span className="font-mono text-lg font-bold text-black tabular-nums">
                        {tokensQ.isLoading ? "…" : tokens.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[0.24em] text-black/60">
                    CSSE
                  </span>
                </div>

                {/* Referral code display */}
                <div className="mt-3 bg-black/10 px-4 py-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-black/60">
                    {isGuest ? "Referrals" : "Your referral code"}
                  </div>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-black/70">
                    Earn tokens by referring friends. Share your code and get rewarded when they join and play.
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-2xl font-bold tracking-[0.24em] text-black">
                      {displayCode || "—"}
                    </span>
                    <button
                      type="button"
                      onClick={copyCode}
                      disabled={isGuest || !refCode}
                      aria-label="Copy referral code"
                      className="grid h-9 w-9 place-items-center bg-black text-[var(--neon)] transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Nav items */}
                <ul className="mt-5 flex flex-col gap-1.5">
                  {items.map((it, i) => {
                    const Icon = it.Icon;
                    return (
                      <li key={it.key}>
                        <button
                          type="button"
                          onClick={it.onClick}
                          className={`flex w-full items-center gap-3 px-3 py-3.5 text-left text-[15px] font-bold uppercase tracking-[0.16em] text-black transition-all duration-300 hover:bg-black/10 active:scale-[0.98] ${
                            open ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                          }`}
                          style={{
                            transitionDelay: open ? `${260 + i * 60}ms` : "0ms",
                          }}
                        >
                          <span className="grid h-9 w-9 place-items-center bg-black/10">
                            <Icon className="h-4 w-4 text-black" />
                          </span>
                          {it.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                {/* Sign out / Register */}
                <div className="mt-auto">
                  <button
                    type="button"
                    onClick={isGuest ? () => pick(() => navigate({ to: "/auth" })) : handleSignOut}
                    className={`flex w-full items-center justify-center gap-2 bg-black px-4 py-3.5 text-[13px] font-bold uppercase tracking-[0.2em] text-[var(--neon)] transition-all duration-300 hover:bg-black/85 active:scale-[0.98] ${
                      open ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                    }`}
                    style={{ transitionDelay: open ? "500ms" : "0ms" }}
                  >
                    {isGuest ? (
                      <>
                        <User className="h-4 w-4" />
                        Register / Log in
                      </>
                    ) : (
                      <>
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      <TokenVaultSheet open={tokensOpen} onOpenChange={setTokensOpen} />
    </>
  );
}
