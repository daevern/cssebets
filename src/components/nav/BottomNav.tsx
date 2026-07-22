import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Activity, Wallet, Headphones } from "lucide-react";
import { WalletCardSheet } from "@/components/wallet/WalletCard";

const items = [
  { to: "/dashboard", label: "Home", icon: Home, exact: true },
  { to: "/my-predictions", label: "Picks", icon: Activity, exact: false },
  { to: "/support", label: "Support", icon: Headphones, exact: false },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const [walletOpen, setWalletOpen] = useState(false);
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)]/70 bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {items.slice(0, 2).map((it) => renderLink(it, pathname))}

        <button
          type="button"
          onClick={() => setWalletOpen(true)}
          className="relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
        >
          <Wallet className="h-[22px] w-[22px]" />
          <span>Wallet</span>
        </button>
        {items.slice(3).map((it) => renderLink(it, pathname))}
      </div>
      <WalletCardSheet open={walletOpen} onOpenChange={setWalletOpen} />
    </nav>
  );
}

function renderLink(it: (typeof items)[number], pathname: string) {
  const Icon = it.icon;
  const active = it.exact ? pathname === it.to : pathname === it.to || pathname.startsWith(it.to + "/");
  return (
    <Link
      key={it.to}
      to={it.to}
      className={`relative flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-semibold tracking-tight transition-colors ${
        active ? "text-[var(--neon)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      <Icon className={`h-[22px] w-[22px] ${active ? "stroke-[2.2]" : ""}`} />
      <span>{it.label}</span>
    </Link>
  );
}
