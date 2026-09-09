import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, X } from "lucide-react";
import { PageShell } from "@/components/ui/page-shell";
import {
  getFantasyOverview,
  getFantasyPool,
  submitFantasyEntry,
  type FantasyPlayerRow,
} from "@/features/fantasy/fantasy.functions";
import { BUDGET, FORMATIONS, MAX_PER_CLUB, validateSquad } from "@/features/fantasy/scoring";

export const Route = createFileRoute("/_authenticated/fantasy/squad")({
  component: SquadPicker,
});

const POS_TONE: Record<string, string> = {
  GK: "bg-amber-500/15 text-amber-300",
  DEF: "bg-sky-500/15 text-sky-300",
  MID: "bg-emerald-500/15 text-emerald-300",
  FWD: "bg-rose-500/15 text-rose-300",
};

const LEAGUE_LABEL: Record<string, string> = {
  EPL: "Premier League",
  LA_LIGA: "La Liga",
  SERIE_A: "Serie A",
};

function SquadPicker() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchPool = useServerFn(getFantasyPool);
  const fetchOverview = useServerFn(getFantasyOverview);
  const submit = useServerFn(submitFantasyEntry);

  const poolQuery = useQuery({ queryKey: ["fantasy", "pool"], queryFn: () => fetchPool() });
  const overviewQuery = useQuery({ queryKey: ["fantasy", "overview"], queryFn: () => fetchOverview() });

  const [formation, setFormation] = useState("4-4-2");
  const [selected, setSelected] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string | null>(null);
  const [viceId, setViceId] = useState<string | null>(null);
  const [sheetPos, setSheetPos] = useState<"GK" | "DEF" | "MID" | "FWD" | null>(null);
  const [search, setSearch] = useState("");
  const [league, setLeague] = useState<"ALL" | "EPL" | "LA_LIGA" | "SERIE_A">("ALL");
  const [hydrated, setHydrated] = useState(false);

  const players = poolQuery.data?.players ?? [];
  const byId = useMemo(
    () => new Map<string, FantasyPlayerRow>(players.map((p) => [p.id, p])),
    [players],
  );
  const gw = overviewQuery.data?.gameweek ?? null;
  const existing = overviewQuery.data?.entry ?? null;

  // Preload an existing squad once.
  if (!hydrated && existing && players.length) {
    setHydrated(true);
    setFormation(existing.formation);
    setSelected(existing.picks.map((p: any) => p.player.id));
    setCaptainId(existing.picks.find((p: any) => p.role === "captain")?.player.id ?? null);
    setViceId(existing.picks.find((p: any) => p.role === "vice")?.player.id ?? null);
  }

  const picks = selected.map((id) => byId.get(id)).filter(Boolean) as FantasyPlayerRow[];
  const spend = Math.round(picks.reduce((s, p) => s + p.price, 0) * 10) / 10;
  const shape = FORMATIONS[formation];
  const need = { GK: 1, DEF: shape.DEF, MID: shape.MID, FWD: shape.FWD };
  const have = (pos: string) => picks.filter((p) => p.position === pos).length;

  const clubCount = (teamId: number) => picks.filter((p) => p.teamProviderId === teamId).length;

  const sheetPlayers = useMemo(() => {
    if (!sheetPos) return [];
    const q = search.trim().toLowerCase();
    return players
      .filter((p) => p.position === sheetPos)
      .filter((p) => (league === "ALL" ? true : p.competitionCode === league))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) || p.teamName.toLowerCase().includes(q) : true))
      .slice(0, 120);
  }, [players, sheetPos, search, league]);

  function toggle(p: FantasyPlayerRow) {
    if (selected.includes(p.id)) {
      setSelected((s) => s.filter((x) => x !== p.id));
      if (captainId === p.id) setCaptainId(null);
      if (viceId === p.id) setViceId(null);
      return;
    }
    if (have(p.position) >= (need as any)[p.position]) {
      toast.error(`Your ${formation} shape is full at ${p.position}.`);
      return;
    }
    if (clubCount(p.teamProviderId) >= MAX_PER_CLUB) {
      toast.error(`Max ${MAX_PER_CLUB} players from ${p.teamName}.`);
      return;
    }
    if (spend + p.price > BUDGET) {
      toast.error("That pick puts you over budget.");
      return;
    }
    setSelected((s) => [...s, p.id]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const check = validateSquad(
        picks.map((p) => ({
          playerId: p.id,
          position: p.position,
          price: p.price,
          teamProviderId: p.teamProviderId,
        })),
        formation,
        captainId ?? "",
        viceId ?? "",
      );
      if (!check.ok) throw new Error(check.reason);
      return submit({
        data: { formation, captainId: captainId!, viceId: viceId!, playerIds: selected },
      });
    },
    onSuccess: () => {
      toast.success("Your XI is in.");
      queryClient.invalidateQueries({ queryKey: ["fantasy"] });
      queryClient.invalidateQueries({ queryKey: ["wallet"] });
      navigate({ to: "/fantasy" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save your team"),
  });

  const locked = gw ? !gw.isOpen : true;

  if (poolQuery.isLoading || overviewQuery.isLoading) {
    return (
      <PageShell kicker="Fantasy" title="Pick your XI">
        <div className="grid place-items-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--neon)]" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell kicker={gw?.name ?? "Fantasy"} title="Pick your" titleAccent="XI">
      <div className="space-y-4 pb-40">
        {!players.length ? (
          <p className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--color-ink-dim)]">
            The player list is still being loaded from the football feed. Please check back shortly.
          </p>
        ) : null}

        <div className="flex items-center gap-2 overflow-x-auto">
          {Object.keys(FORMATIONS).map((f) => (
            <button
              key={f}
              disabled={locked}
              onClick={() => {
                setFormation(f);
                setSelected([]);
                setCaptainId(null);
                setViceId(null);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                formation === f
                  ? "bg-[var(--neon)] text-black"
                  : "bg-[var(--surface-3,rgba(255,255,255,0.05))] text-[var(--color-ink-dim)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
          <section key={pos} className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${POS_TONE[pos]}`}>{pos}</span>
                {have(pos)}/{(need as any)[pos]}
              </h3>
              {!locked && have(pos) < (need as any)[pos] ? (
                <button
                  onClick={() => {
                    setSearch("");
                    setSheetPos(pos);
                  }}
                  className="rounded-full bg-[var(--neon)]/15 px-3 py-1 text-xs font-semibold text-[var(--neon)]"
                >
                  Add
                </button>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1.5">
              {picks
                .filter((p) => p.position === pos)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-xl bg-[var(--surface-3,rgba(255,255,255,0.03))] px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    <span className="truncate text-[11px] text-[var(--color-ink-dim)]">{p.teamName}</span>
                    <span className="font-mono text-xs tabular-nums">{p.price.toFixed(1)}m</span>
                    {!locked ? (
                      <>
                        <button
                          onClick={() => setCaptainId(p.id)}
                          className={`h-6 w-6 rounded-full text-[10px] font-bold ${
                            captainId === p.id ? "bg-[var(--neon)] text-black" : "bg-white/5 text-[var(--color-ink-dim)]"
                          }`}
                        >
                          C
                        </button>
                        <button
                          onClick={() => setViceId(p.id)}
                          className={`h-6 w-6 rounded-full text-[10px] font-bold ${
                            viceId === p.id ? "bg-white/80 text-black" : "bg-white/5 text-[var(--color-ink-dim)]"
                          }`}
                        >
                          V
                        </button>
                        <button onClick={() => toggle(p)} aria-label={`Remove ${p.name}`}>
                          <X className="h-4 w-4 text-[var(--color-ink-dim)]" />
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Sticky budget + submit bar */}
      <div className="fixed inset-x-0 bottom-16 z-40 border-t border-[var(--color-surface-border)] bg-[var(--surface-2)]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[11px] text-[var(--color-ink-dim)]">
              <span>{picks.length}/11 picked</span>
              <span className={spend > BUDGET ? "text-rose-400" : ""}>
                {spend.toFixed(1)}m / {BUDGET}m
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--neon)] transition-all"
                style={{ width: `${Math.min(100, (spend / BUDGET) * 100)}%` }}
              />
            </div>
          </div>
          <button
            disabled={locked || saveMutation.isPending || picks.length !== 11}
            onClick={() => saveMutation.mutate()}
            className="rounded-xl bg-[var(--neon)] px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {saveMutation.isPending ? "Saving…" : existing ? "Update XI" : `Enter · ${gw?.entryFee ?? 0} pts`}
          </button>
        </div>
      </div>

      {/* Player picker sheet */}
      {sheetPos ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={() => setSheetPos(null)}>
          <div
            className="max-h-[80vh] rounded-t-2xl border-t border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add a {sheetPos}</h3>
              <button onClick={() => setSheetPos(null)} aria-label="Close">
                <X className="h-5 w-5 text-[var(--color-ink-dim)]" />
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
              <Search className="h-4 w-4 text-[var(--color-ink-dim)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player or club"
                className="w-full bg-transparent text-base outline-none placeholder:text-[var(--color-ink-dim)]"
              />
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {(["ALL", "EPL", "LA_LIGA", "SERIE_A"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLeague(l)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs ${
                    league === l ? "bg-[var(--neon)] text-black" : "bg-white/5 text-[var(--color-ink-dim)]"
                  }`}
                >
                  {l === "ALL" ? "All leagues" : LEAGUE_LABEL[l]}
                </button>
              ))}
            </div>
            <ul className="mt-3 max-h-[52vh] space-y-1 overflow-y-auto">
              {sheetPlayers.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      toggle(p);
                      setSheetPos(null);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{p.name}</span>
                      <span className="block truncate text-[11px] text-[var(--color-ink-dim)]">
                        {p.teamName} · {LEAGUE_LABEL[p.competitionCode] ?? p.competitionCode}
                      </span>
                    </span>
                    <span className="font-mono text-sm tabular-nums">{p.price.toFixed(1)}m</span>
                  </button>
                </li>
              ))}
              {!sheetPlayers.length ? (
                <li className="py-6 text-center text-sm text-[var(--color-ink-dim)]">No players found.</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
