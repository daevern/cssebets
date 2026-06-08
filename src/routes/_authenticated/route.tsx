import { createFileRoute, Outlet, redirect, Link, useRouter, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyWallet } from "@/lib/wallet.functions";
import { Trophy, Home, ListChecks, History, BarChart3, Shield, LogOut, Loader2, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { userId: data.user.id };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { isAdmin, isMember, isPending, loading, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const location = useLocation();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isPending && !isMember && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="max-w-md p-8 text-center space-y-4">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-warning/20 grid place-items-center">
            <Shield className="h-7 w-7 text-warning" />
          </div>
          <h1 className="text-xl font-bold">Waiting for approval</h1>
          <p className="text-sm text-muted-foreground">
            Hi {user?.email}. An admin needs to approve your account before you can join the pool.
          </p>
          <Button variant="outline" onClick={signOut} className="w-full">Sign out</Button>
        </Card>
      </div>
    );
  }

  const navItems = [
    { to: "/", label: "Home", icon: Home },
    { to: "/matches", label: "Matches", icon: ListChecks },
    { to: "/my-predictions", label: "Picks", icon: History },
    { to: "/leaderboard", label: "Board", icon: BarChart3 },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ] as const;

  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Trophy className="h-5 w-5 text-primary" />
            <span>WC26 Pool</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="px-3 py-1.5 rounded-md text-sm hover:bg-muted [&.active]:bg-muted [&.active]:text-primary"
                activeOptions={{ exact: item.to === "/" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t bg-background/95 backdrop-blur">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {navItems.slice(0, 5).map((item) => {
            const active = item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
