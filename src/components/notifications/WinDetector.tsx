import { useEffect, useMemo, useState } from "react";
import { useLatestWin } from "./useNotifications";
import { WinTicketModal, type WinTicketData } from "./WinTicketModal";
import { useLocation, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

const SEEN_KEY = "notif:lastSeenWinId";

function toTicket(p: any): WinTicketData | null {
  if (!p) return null;
  const stake = Number(p.virtual_stake ?? 0);
  const odds = Number(p.reference_odds ?? 0);
  const gross = Number(p.gross_payout ?? stake * odds);
  const profit = Number(p.net_profit ?? gross - stake);
  const home = p.matches?.home_team ?? "";
  const away = p.matches?.away_team ?? "";
  return {
    id: String(p.id),
    matchLabel: home && away ? `${home} vs ${away}` : (p.market_label ?? "Prediction"),
    homeTeam: home || undefined,
    awayTeam: away || undefined,
    marketLabel: p.market_label ?? p.market ?? "Market",
    selectionLabel: p.selection_label ?? p.outcome ?? "Selection",
    odds,
    stake,
    gross,
    profit,
    settledAt: p.settled_at ?? new Date().toISOString(),
  };
}

/**
 * Global win detector. Watches the most recent WON prediction and pops the
 * celebratory ticket the first time each new win is seen (persisted via
 * localStorage), plus whenever /notifications?win=<id> is present.
 */
export function WinDetector() {
  const { data } = useLatestWin();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState<any | null>(null);
  const location = useLocation();
  const router = useRouter();

  // Deep-link: /notifications?win=<id> — fetch that specific prediction.
  const winParam = useMemo(() => {
    const s = (location.search as any) || {};
    return typeof s === "object" ? s.win : undefined;
  }, [location.search]);

  useEffect(() => {
    let cancelled = false;
    if (!winParam) { setForced(null); return; }
    (async () => {
      const { data: p } = await supabase
        .from("predictions")
        .select("id, market, outcome, reference_odds, virtual_stake, gross_payout, net_profit, status, settled_at, selection_label, market_label, matches:match_id(home_team, away_team)")
        .eq("id", winParam)
        .maybeSingle();
      if (cancelled) return;
      if (p && (p as any).status === "won") {
        setForced(p);
        setOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [winParam]);

  // Auto-pop on new win detection.
  useEffect(() => {
    if (!data?.id || forced) return;
    if (typeof window === "undefined") return;
    const seen = window.localStorage.getItem(SEEN_KEY);
    if (seen !== data.id) {
      setOpen(true);
    }
  }, [data?.id, forced]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      const activeId = forced?.id ?? data?.id;
      if (activeId && typeof window !== "undefined") {
        window.localStorage.setItem(SEEN_KEY, String(activeId));
      }
      if (winParam) {
        router.navigate({ to: "/notifications", replace: true });
        setForced(null);
      }
    }
  }

  const ticket = toTicket(forced ?? data);

  return <WinTicketModal open={open} onOpenChange={handleOpenChange} data={ticket} />;
}
