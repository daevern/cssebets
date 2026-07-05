import { Link, useLocation } from "@tanstack/react-router";
import { Home, LineChart, Activity, Coins, Headphones } from "lucide-react";

const items = [
  { to: "/dashboard", label: "Home", icon: Home, exact: true },
  { to: "/matches", label: "Markets", icon: LineChart, exact: false },
  { to: "/my-predictions", label: "Picks", icon: Activity, exact: false },
  { to: "/payout", label: "Payout", icon: Coins, exact: false },
  { to: "/support", label: "Support", icon: Headphones, exact: false },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-surface-border)]/70 bg-[var(--surface)]/95 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((it) => {
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
        })}
      </div>
    </nav>
  );
}
