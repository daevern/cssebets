import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Wallet as WalletIcon, Bell, User, Coins, X } from "lucide-react";
import { WalletCardSheet } from "@/components/wallet/WalletCard";
import { TokenVaultSheet } from "@/components/engagement/TokenVault";

/**
 * Mobile-only condensed menu.
 * - 3-line trigger (top 2 white, bottom 1 green).
 * - On click: SVG-goo liquid-drop expansion into a full-height, 3/4-width
 *   green panel that overlays the page.
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const navigate = useNavigate();

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

  const items = [
    { key: "wallet", label: "Wallet", Icon: WalletIcon, onClick: () => pick(() => setWalletOpen(true)) },
    { key: "tokens", label: "Tokens", Icon: Coins, onClick: () => pick(() => setTokensOpen(true)) },
    { key: "notifications", label: "Alerts", Icon: Bell, onClick: () => pick(() => navigate({ to: "/notifications" })) },
    { key: "profile", label: "Profile", Icon: User, onClick: () => pick(() => navigate({ to: "/settings" })) },
  ] as const;

  return (
    <>
      {/* SVG goo filter (rendered once, referenced from portal) */}
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
              {/* Drip drops that "seed" the liquid from the trigger corner */}
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

              {/* Main blob — grows out from top-right */}
              <div
                className={`absolute inset-0 origin-top-right bg-[var(--neon)] shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] transition-all duration-500 ease-[cubic-bezier(0.34,1.4,0.64,1)] ${
                  open
                    ? "opacity-100 scale-100 rounded-l-[36px]"
                    : "opacity-0 scale-[0.15] rounded-l-[80px]"
                }`}
                style={{
                  paddingTop: "calc(env(safe-area-inset-top) + 24px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
                }}
              >
                {/* Content is NOT filtered by goo — sits above via z-index */}
              </div>

              {/* Content layer (above the gooey blob so text stays crisp) */}
              <div
                className={`relative flex h-full flex-col px-6 transition-opacity duration-300 ${
                  open ? "opacity-100 delay-200" : "opacity-0"
                }`}
                style={{
                  paddingTop: "calc(env(safe-area-inset-top) + 20px)",
                  paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
                  filter: "none",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-black/70">
                    Menu
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="grid h-9 w-9 place-items-center rounded-full bg-black/10 text-black transition-colors hover:bg-black/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <ul className="mt-8 flex flex-col gap-2">
                  {items.map((it, i) => {
                    const Icon = it.Icon;
                    return (
                      <li key={it.key}>
                        <button
                          type="button"
                          onClick={it.onClick}
                          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-[15px] font-bold uppercase tracking-[0.16em] text-black transition-all duration-300 hover:bg-black/10 active:scale-[0.98] ${
                            open ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
                          }`}
                          style={{
                            transitionDelay: open ? `${260 + i * 60}ms` : "0ms",
                          }}
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-black/10">
                            <Icon className="h-4 w-4 text-black" />
                          </span>
                          {it.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-auto text-right text-[9px] font-bold uppercase tracking-[0.3em] text-black/50">
                  cssebets
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      <WalletCardSheet open={walletOpen} onOpenChange={setWalletOpen} />
      <TokenVaultSheet open={tokensOpen} onOpenChange={setTokensOpen} />
    </>
  );
}
