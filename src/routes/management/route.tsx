import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyStaffRole, getStaffCounts, staffUnreadConvCount, getMyForcePasswordChange } from "@/lib/management.functions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { CsseMark } from "@/components/brand/CsseMark";
import {
  IconSupport,
  IconSettings,
  IconLogout,
} from "@/components/brand/NavIcons";
import type { SVGProps } from "react";

/* Stencil icons specific to the staff portal */
const stroke = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
function IconUsers(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...p}>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.7-2.8 3-4.5 5.5-4.5s4.8 1.7 5.5 4.5" />
      <circle cx="17" cy="10.5" r="2.4" />
      <path d="M15 19c.5-2 2-3 4-3 1.4 0 2.7.6 3.5 1.8" />
    </svg>
  );
}
function IconChat(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...p}>
      <path d="M4 5h16v11H8l-4 3z" />
      <line x1="8" y1="10" x2="14" y2="10" />
      <line x1="8" y1="13" x2="12" y2="13" />
    </svg>
  );
}
function IconDash(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...p}>
      <rect x="3.5" y="3.5" width="7" height="9" />
      <rect x="13.5" y="3.5" width="7" height="5" />
      <rect x="3.5" y="15.5" width="7" height="5" />
      <rect x="13.5" y="11.5" width="7" height="9" />
    </svg>
  );
}
function IconCrown(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...stroke} {...p}>
      <path d="M3 8 L7 14 L12 6 L17 14 L21 8 L19.5 19 H4.5 Z" />
      <line x1="4.5" y1="17" x2="19.5" y2="17" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export const Route = createFileRoute("/management")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/management/login" || location.pathname === "/management/access-denied") {
      return {};
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/management/login" });
    return { userId: data.user.id };
  },
  component: ManagementLayout,
});

function ManagementLayout() {
  const location = useLocation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const path = location.pathname;

  const isPublicRoute = path === "/management/login" || path === "/management/access-denied";
  const isChangePwRoute = path === "/management/change-password";

  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const canQuery = !isPublicRoute && hasSession === true;

  async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return fn();
  }

  const roleFn = useServerFn(getMyStaffRole);
  const roleQ = useQuery({
    queryKey: ["mgmt-role"],
    queryFn: () => withSession(() => roleFn({})),
    staleTime: 30_000,
    enabled: canQuery,
  });

  const countsFn = useServerFn(getStaffCounts);
  const counts = useQuery({
    queryKey: ["mgmt-counts"],
    queryFn: () => withSession(() => countsFn({})),
    enabled: canQuery && !!roleQ.data?.role,
    refetchInterval: 20_000,
  });

  const unreadFn = useServerFn(staffUnreadConvCount);
  const unread = useQuery({
    queryKey: ["mgmt-unread-conv"],
    queryFn: () => withSession(() => unreadFn({})),
    enabled: canQuery && !!roleQ.data?.role,
    refetchInterval: 15_000,
  });

  const forceFn = useServerFn(getMyForcePasswordChange);
  const force = useQuery({
    queryKey: ["mgmt-force-pw"],
    queryFn: () => withSession(() => forceFn({})),
    enabled: canQuery && !!roleQ.data?.role,
  });

  useEffect(() => {
    if (!isPublicRoute && force.data?.force && path !== "/management/change-password") {
      router.navigate({ to: "/management/change-password", replace: true });
    }
  }, [force.data?.force, path, router, isPublicRoute]);

  const role = roleQ.data?.role;
  const isAdminTier = role === "admin" || role === "super_admin";
  const isSuper = role === "super_admin";

  const supportBadge = (counts.data?.pendingUsers ?? 0) + (counts.data?.pendingPointRequests ?? 0);
  const chatBadge = unread.data?.count ?? 0;
  const totalBadge = supportBadge + chatBadge;

  useEffect(() => {
    if (isPublicRoute) return;
    const base = "cssebets management";
    document.title = totalBadge > 0 ? `(${totalBadge > 99 ? "99+" : totalBadge}) ${base}` : base;
  }, [totalBadge, isPublicRoute]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/management/login", replace: true });
  }

  if (isPublicRoute) {
    return (
      <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
        <Outlet />
      </div>
    );
  }

  if (isChangePwRoute) {
    return (
      <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
        <Outlet />
      </div>
    );
  }

  if (roleQ.isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--color-surface)] text-[var(--color-ink)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--color-surface)] text-[var(--color-ink)] p-4">
        <article className="relative max-w-md w-full overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
          <span aria-hidden className="pointer-events-none absolute top-0 left-0 h-3 w-3 border-t border-l border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute top-0 right-0 h-3 w-3 border-t border-r border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-3 w-3 border-b border-l border-[var(--color-neon)]" />
          <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b border-r border-[var(--color-neon)]" />
          <div className="px-6 py-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center border border-[var(--color-neon)]/40 bg-[#070D0A]">
              <CsseMark className="h-6 w-6 text-[var(--color-ink)]" />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">Staff portal</div>
            <h1 className="font-display text-xl font-bold">No clearance on record</h1>
            <p className="text-sm text-[var(--color-ink-muted)]">You're signed in, but you don't have staff permissions yet.</p>
            <Button variant="outline" onClick={signOut} className="w-full border-[var(--color-surface-border)] bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface)]">Sign out</Button>
          </div>
        </article>
      </div>
    );
  }

  if (path.startsWith("/management/admin") && !isAdminTier) {
    throw redirect({ to: "/management/access-denied" });
  }
  if (path.startsWith("/management/super-admin") && !isSuper) {
    throw redirect({ to: "/management/access-denied" });
  }

  const nav: { to: string; label: string; icon: any; badge?: number }[] = [];
  nav.push({ to: "/management/support", label: "Support", icon: IconSupport, badge: supportBadge });
  nav.push({ to: "/management/users", label: "Users", icon: IconUsers });
  nav.push({ to: "/management/chat", label: "Chat", icon: IconChat, badge: chatBadge });
  if (isAdminTier) nav.push({ to: "/management/admin", label: "Admin", icon: IconDash });
  if (isSuper) nav.push({ to: "/management/super-admin", label: "Super", icon: IconCrown });
  nav.push({ to: "/management/settings", label: "Settings", icon: IconSettings });

  function Badge({ n }: { n: number }) {
    if (!n || n <= 0) return null;
    const label = n > 99 ? "99+" : String(n);
    return (
      <span className="absolute -top-1 -right-1.5 inline-flex min-w-[16px] h-[16px] items-center justify-center bg-[var(--color-neon)] px-1 text-[9px] font-bold text-[var(--color-surface)] tabular-nums">
        {label}
      </span>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scanline grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />

      <header className="sticky top-0 z-40 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/70">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, var(--color-neon) 0 6px, transparent 6px 12px)",
            opacity: 0.4,
          }}
        />
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <Link to="/management/support" className="flex items-center gap-2 min-w-0">
            <CsseMark className="h-7 w-7 shrink-0 text-[var(--color-ink)]" title="CSSEBets" />
            <div className="hidden sm:flex flex-col leading-none min-w-0">
              <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">Staff</span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)] truncate">Management Console</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="relative flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] [&.active]:text-[var(--color-neon)]"
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                  <Badge n={item.badge ?? 0} />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden sm:inline-flex items-center border border-dashed border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">
              {role.replace("_", " ")}
            </span>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-2 text-[var(--color-ink-muted)] hover:text-[var(--color-neon)]"
            >
              <IconLogout className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile pill nav */}
        <nav className="md:hidden flex items-center gap-1.5 px-3 pb-2 overflow-x-auto scrollbar-none">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="relative shrink-0 inline-flex items-center gap-1.5 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)] [&.active]:border-[var(--color-neon)]/50 [&.active]:text-[var(--color-neon)]"
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
                <Badge n={item.badge ?? 0} />
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="relative flex-1 max-w-6xl w-full mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <Outlet />
      </main>
    </div>
  );
}
