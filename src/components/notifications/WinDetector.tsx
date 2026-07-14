import { useEffect, useMemo, useState } from "react";
import { useLatestWin } from "./useNotifications";
import { WinTicketModal, type WinTicketData } from "./WinTicketModal";
import { useLocation, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const SEEN_KEY_PREFIX = "notif:seenWinIds:";

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
  const { user } = useAuth();
  const { data } = useLatestWin();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState<any | null>(null);
  const location = useLocation();
  const router = useRouter();

  const seenKey = user?.id ? `${SEEN_KEY_PREFIX}${user.id}` : null;

  function readSeen(): Set<string> {
    if (!seenKey || typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem(seenKey);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch { return new Set(); }
  }

  function markSeen(id: string) {
    if (!seenKey || typeof window === "undefined") return;
    const s = readSeen();
    if (s.has(id)) return;
    s.add(id);
    // Keep list bounded
    const arr = Array.from(s).slice(-50);
    window.localStorage.setItem(seenKey, JSON.stringify(arr));
  }

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

  // Auto-pop on new win detection — but only once ever per win id.
  useEffect(() => {
    if (!data?.id || forced || !seenKey) return;
    const seen = readSeen();
    if (!seen.has(String(data.id))) {
      setOpen(true);
      // Mark as seen immediately on open so reloads/re-logins won't re-pop.
      markSeen(String(data.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, forced, seenKey]);

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      const activeId = forced?.id ?? data?.id;
      if (activeId) markSeen(String(activeId));
      if (winParam) {
        router.navigate({ to: "/notifications", replace: true });
        setForced(null);
      }
    }
  }

  // PROMO: force the celebratory ticket for specific accounts so they can
  // screenshot it for Instagram. Each promo has a fixed stake/odds/payout
  // that matches the override inside WinTicketModal (when applicable).
  const PROMO_USER_ID = "ba37e352-b4bf-4fb1-a15c-11b11a3b4cb1";
  const PROMO_USER_ID_ARG = "79b6a2c9-8ed2-45ba-8ef6-c24620a0c410";
  const [promoOpen, setPromoOpen] = useState(false);
  useEffect(() => {
    if (user?.id === PROMO_USER_ID || user?.id === PROMO_USER_ID_ARG) setPromoOpen(true);
  }, [user?.id]);

  if (user?.id === PROMO_USER_ID && !forced && !data) {
    const promoTicket: WinTicketData = {
      id: "promo-ticket-0001",
      matchLabel: "Norway vs England",
      homeTeam: "Norway",
      awayTeam: "England",
      marketLabel: "result",
      selectionLabel: "DRAW",
      odds: 3.88,
      stake: 1000,
      gross: 3880,
      profit: 2880,
      settledAt: new Date().toISOString(),
    };
    return <WinTicketModal open={promoOpen} onOpenChange={setPromoOpen} data={promoTicket} />;
  }

  if (user?.id === PROMO_USER_ID_ARG && !forced && !data) {
    // Correct score 1-1 @ 6.50, stake 800 → payout 5200, profit 4400
    const promoTicket: WinTicketData = {
      id: "promo-ticket-arg-0001",
      matchLabel: "Argentina vs Switzerland",
      homeTeam: "Argentina",
      awayTeam: "Switzerland",
      marketLabel: "correct score",
      selectionLabel: "1-1",
      odds: 6.50,
      stake: 800,
      gross: 5200,
      profit: 4400,
      settledAt: new Date().toISOString(),
    };
    return <WinTicketModal open={promoOpen} onOpenChange={setPromoOpen} data={promoTicket} />;
  }

  const ticket = toTicket(forced ?? data);

  return <WinTicketModal open={open} onOpenChange={handleOpenChange} data={ticket} />;
}

