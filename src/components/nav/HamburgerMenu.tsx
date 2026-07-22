import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Wallet as WalletIcon, Bell, User, Coins } from "lucide-react";
import { WalletCardSheet } from "@/components/wallet/WalletCard";
import { TokenVaultSheet } from "@/components/engagement/TokenVault";

/**
 * Mobile-only condensed menu.
 * - 3-line icon (top 2 white, bottom 1 green).
 * - On click: SVG goo/liquid-drop expansion reveals 4 options.
 * - Panel background: neon green; text: black.
 */
export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    // let close animation start, then run action
    setTimeout(fn, 120);
  };

  const items = [
    {
      key: "wallet",
      label: "Wallet",
      Icon: WalletIcon,
      onClick: () => pick(() => setWalletOpen(true)),
    },
    {
      key: "tokens",
      label: "Tokens",
      Icon: Coins,
      onClick: () => pick(() => setTokensOpen(true)),
    },
    {
      key: "notifications",
      label: "Alerts",
      Icon: Bell,
      onClick: () => pick(() => navigate({ to: "/notifications" })),
    },
    {
      key: "profile",
      label: "Profile",
      Icon: User,
      onClick: () => pick(() => navigate({ to: "/settings" })),
    },
  ] as const;

  return (
    <div ref={rootRef} className="relative">
      {/* SVG filter for gooey/liquid-drop effect */}
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <filter id="csse-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
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
        className="relative z-20 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-surface-border)]/70 bg-[var(--surface-2)] transition-colors hover:border-[var(--neon)]/50"
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

      {/* Liquid-drop expansion panel */}
      <div
        className={`absolute right-0 top-full z-10 mt-2 origin-top-right ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{ filter: "url(#csse-goo)" }}
      >
        {/* Drop-connector blob (creates the "dripping" merge with trigger) */}
        <span
          aria-hidden
          className={`absolute right-3 -top-2 block h-4 w-4 rounded-full bg-[var(--neon)] transition-all duration-300 ${
            open ? "scale-100 opacity-100" : "scale-0 opacity-0"
          }`}
        />

        {/* Main blob panel */}
        <div
          className={`relative rounded-[26px] bg-[var(--neon)] p-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            open
              ? "scale-100 opacity-100 translate-y-0"
              : "scale-50 opacity-0 -translate-y-3"
          }`}
        >
          <ul className="grid w-44 gap-1">
            {items.map((it, i) => {
              const Icon = it.Icon;
              return (
                <li key={it.key}>
                  <button
                    type="button"
                    onClick={it.onClick}
                    className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left text-[13px] font-bold uppercase tracking-[0.14em] text-black transition-all duration-200 hover:bg-black/10 active:scale-[0.98] ${
                      open ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"
                    }`}
                    style={{
                      transitionDelay: open ? `${120 + i * 40}ms` : "0ms",
                    }}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-black" />
                    {it.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <WalletCardSheet open={walletOpen} onOpenChange={setWalletOpen} />
      <TokenVaultSheet open={tokensOpen} onOpenChange={setTokensOpen} />
    </div>
  );
}
