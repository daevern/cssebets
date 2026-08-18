import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { useHasSession } from "@/hooks/use-staff-session";
import {
  arcadeAdminConfigs,
  arcadeAdminPublishConfig,
  arcadeAdminRounds,
  arcadeAdminSnapshot,
  miniAdminOverview,
  miniAdminPublishConfig,
  MINI_PRODUCTS,
  type ArcadeGame,
  type MiniAdminProduct,
} from "@/lib/arcade/arcade-admin.functions";
import {
  MgmtBtn,
  MgmtField,
  MgmtKpi,
  MgmtPageHeader,
  MgmtPanel,
  MgmtStatus,
  MgmtTable,
  MgmtTabs,
  MgmtTd,
  MgmtTh,
  MgmtAlert,
  MgmtAlertStack,
  mgmtInputClass,
} from "@/components/management/ops-ui";

export const Route = createFileRoute("/management/admin/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade control — CSSEBets Operator" },
      {
        name: "description",
        content:
          "Casino floor control: live exposure, per-game risk limits, kill-switches and round audit.",
      },
    ],
  }),
  component: AdminArcadePage,
});

const CORE_GAMES: { id: ArcadeGame; label: string }[] = [
  { id: "plinko", label: "Plinko" },
  { id: "roulette", label: "Roulette" },
  { id: "treasure", label: "Treasure" },
  { id: "blackjack", label: "Blackjack" },
  { id: "rps", label: "RPS" },
];

const MINI_LABELS: Record<MiniAdminProduct, string> = {
  hilo: "Hi-Lo",
  dice: "Dice",
  wheel: "Wheel",
  keno: "Keno",
  crash: "Crash",
  towers: "Towers",
  poker: "Poker",
};

const WINDOWS = [
  { h: 24, label: "24h" },
  { h: 168, label: "7d" },
  { h: 720, label: "30d" },
];

const fmt = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

type FloorTab = "floor" | ArcadeGame | MiniAdminProduct;

function AdminArcadePage() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const enabled = hasSession === true;

  const snapshotFn = useServerFn(arcadeAdminSnapshot);
  const configsFn = useServerFn(arcadeAdminConfigs);
  const roundsFn = useServerFn(arcadeAdminRounds);
  const publishFn = useServerFn(arcadeAdminPublishConfig);
  const miniOverviewFn = useServerFn(miniAdminOverview);
  const miniPublishFn = useServerFn(miniAdminPublishConfig);

  const [windowHours, setWindowHours] = useState(24);
  const [tab, setTab] = useState<FloorTab>("floor");

  const snap = useQuery({
    queryKey: ["arcade-admin", "snapshot", windowHours],
    queryFn: () => snapshotFn({ data: { windowHours } }),
    enabled,
    refetchInterval: 5000,
  });

  const configs = useQuery({
    queryKey: ["arcade-admin", "configs"],
    queryFn: () => configsFn(),
    enabled,
  });

  const mini = useQuery({
    queryKey: ["arcade-admin", "mini", windowHours],
    queryFn: () => miniOverviewFn({ data: { windowHours } }),
    enabled,
    refetchInterval: 8000,
  });

  const isCore = CORE_GAMES.some((g) => g.id === tab);
  const isMini = (MINI_PRODUCTS as readonly string[]).includes(tab);

  const rounds = useQuery({
    queryKey: ["arcade-admin", "rounds", tab],
    queryFn: () => roundsFn({ data: { game: tab as ArcadeGame, limit: 50 } }),
    enabled: enabled && isCore,
    refetchInterval: 10000,
  });

  const totals = useMemo(() => {
    const g = snap.data?.games ?? [];
    const m = mini.data?.stats ?? [];
    return {
      livePlayers:
        g.reduce((a, x) => a + x.livePlayers, 0) + m.reduce((a, x) => a + x.livePlayers, 0),
      liveRounds:
        g.reduce((a, x) => a + x.liveRounds, 0) + m.reduce((a, x) => a + x.liveRounds, 0),
      liveStake: g.reduce((a, x) => a + x.liveStake, 0) + m.reduce((a, x) => a + x.liveStake, 0),
      reserved: g.reduce((a, x) => a + x.reserved, 0),
      staked: g.reduce((a, x) => a + x.staked, 0) + m.reduce((a, x) => a + x.staked, 0),
      paid: g.reduce((a, x) => a + x.paid, 0) + m.reduce((a, x) => a + x.paid, 0),
    };
  }, [snap.data, mini.data]);

  const pausedCount = useMemo(() => {
    let n = 0;
    if (configs.data?.roulette?.maintenance_mode) n++;
    if (configs.data?.rps?.maintenance_mode) n++;
    for (const t of configs.data?.treasure ?? []) if (t.maintenance_mode) n++;
    for (const c of mini.data?.configs ?? []) if (c.maintenance_mode) n++;
    return n;
  }, [configs.data, mini.data]);

  if (hasSession === false) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--mgmt-muted)]">
        <ShieldAlert className="h-4 w-4" /> Staff session required.
      </div>
    );
  }

  const houseNet = totals.staked - totals.paid;
  const margin = totals.staked > 0 ? (houseNet / totals.staked) * 100 : null;

  const tabs = [
    { id: "floor", label: "Floor" },
    ...CORE_GAMES.map((g) => ({ id: g.id, label: g.label })),
    ...MINI_PRODUCTS.map((p) => ({ id: p, label: MINI_LABELS[p] })),
  ];

  return (
    <div className="space-y-6">
      <MgmtPageHeader
        eyebrow="Casino floor"
        title="Arcade control"
        description="Live exposure, table kill-switches, stake limits and round audit across all CSSE Originals."
        actions={
          <>
            <div className="flex rounded-md border border-[var(--mgmt-border)] bg-[var(--mgmt-panel)] p-0.5">
              {WINDOWS.map((w) => (
                <MgmtBtn
                  key={w.h}
                  variant={windowHours === w.h ? "primary" : "ghost"}
                  onClick={() => setWindowHours(w.h)}
                >
                  {w.label}
                </MgmtBtn>
              ))}
            </div>
            <MgmtBtn
              variant="secondary"
              onClick={() => qc.invalidateQueries({ queryKey: ["arcade-admin"] })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </MgmtBtn>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <MgmtKpi label="Players in play" value={fmt(totals.livePlayers)} />
        <MgmtKpi label="Open rounds" value={fmt(totals.liveRounds)} />
        <MgmtKpi label="Stake at risk" value={fmt(totals.liveStake, 0)} />
        <MgmtKpi label="Reserved liability" value={fmt(totals.reserved, 0)} />
        <MgmtKpi
          label="Available reserve"
          value={fmt(snap.data?.availableReserve ?? null)}
          tone={(snap.data?.availableReserve ?? 1) <= 0 ? "bad" : "ok"}
        />
        <MgmtKpi
          label="Tables paused"
          value={fmt(pausedCount)}
          tone={pausedCount > 0 ? "warn" : "ok"}
        />
      </div>

      <MgmtAlertStack>
        {(snap.data?.availableReserve ?? 1) <= 0 ? (
          <MgmtAlert tone="bad" title="Arcade reserve exhausted">
            Available liability reserve is at or below zero. Pause high-variance tables until treasury tops up.
          </MgmtAlert>
        ) : null}
        {pausedCount > 0 ? (
          <MgmtAlert tone="warn" title={`${pausedCount} table${pausedCount === 1 ? "" : "s"} paused`}>
            Kill-switches are active. Players cannot open new rounds on paused products.
          </MgmtAlert>
        ) : null}
      </MgmtAlertStack>

      <MgmtTabs items={tabs} value={tab} onChange={(id) => setTab(id as FloorTab)} />

      {tab === "floor" ? (
        <FloorOverview
          windowHours={snap.data?.windowHours ?? windowHours}
          coreGames={snap.data?.games ?? []}
          miniStats={mini.data?.stats ?? []}
          miniConfigs={mini.data?.configs ?? []}
          coreConfigs={configs.data}
          activity={snap.data?.activity ?? []}
          houseNet={houseNet}
          margin={margin}
          totals={totals}
        />
      ) : isMini ? (
        <MiniGameDesk
          product={tab as MiniAdminProduct}
          overview={mini.data}
          loading={mini.isLoading}
          onPublish={async (patch, reason) => {
            await miniPublishFn({ data: { product: tab as MiniAdminProduct, patch, reason } });
            toast.success("Config published");
            qc.invalidateQueries({ queryKey: ["arcade-admin"] });
          }}
        />
      ) : (
        <CoreGameDesk
          game={tab as ArcadeGame}
          configs={configs.data}
          rounds={rounds.data ?? []}
          loading={rounds.isLoading || configs.isLoading}
          onPublish={async (payload) => {
            await publishFn({ data: payload });
            toast.success("Config published");
            qc.invalidateQueries({ queryKey: ["arcade-admin"] });
          }}
        />
      )}
    </div>
  );
}

function FloorOverview({
  windowHours,
  coreGames,
  miniStats,
  miniConfigs,
  coreConfigs,
  activity,
  houseNet,
  margin,
  totals,
}: {
  windowHours: number;
  coreGames: any[];
  miniStats: any[];
  miniConfigs: any[];
  coreConfigs: any;
  activity: any[];
  houseNet: number;
  margin: number | null;
  totals: { livePlayers: number; liveRounds: number; liveStake: number; reserved: number; staked: number; paid: number };
}) {
  const rows = [
    ...coreGames.map((g) => {
      let state = "Live";
      let tone: "ok" | "warn" | "idle" = "ok";
      if (g.game === "roulette" && coreConfigs?.roulette?.maintenance_mode) {
        state = "Paused";
        tone = "warn";
      }
      if (g.game === "rps" && coreConfigs?.rps?.maintenance_mode) {
        state = "Paused";
        tone = "warn";
      }
      if (g.game === "treasure" && (coreConfigs?.treasure ?? []).some((t: any) => t.maintenance_mode)) {
        state = "Paused";
        tone = "warn";
      }
      return {
        key: g.game,
        label: CORE_GAMES.find((x) => x.id === g.game)?.label ?? g.game,
        ...g,
        state,
        tone,
      };
    }),
    ...miniStats.map((s) => {
      const c = miniConfigs.find((x: any) => x.product === s.product);
      const paused = !!c?.maintenance_mode;
      return {
        key: s.product,
        label: MINI_LABELS[s.product as MiniAdminProduct] ?? s.product,
        livePlayers: s.livePlayers,
        liveRounds: s.liveRounds,
        liveStake: s.liveStake,
        reserved: 0,
        rounds: s.rounds,
        players: s.players,
        staked: s.staked,
        paid: s.paid,
        houseNet: s.houseNet,
        margin: s.margin == null ? null : s.margin * 100,
        state: paused ? "Paused" : `Live · v${c?.version ?? "—"}`,
        tone: paused ? ("warn" as const) : ("ok" as const),
      };
    }),
  ];

  return (
    <div className="space-y-4">
      <MgmtPanel
        title={`Floor performance · last ${windowHours}h`}
        description="All tables. House net is stake minus payouts over the selected window."
      >
        <MgmtTable minWidth="900px">
          <thead>
            <tr>
              <MgmtTh>Table</MgmtTh>
              <MgmtTh>Live</MgmtTh>
              <MgmtTh>Open</MgmtTh>
              <MgmtTh>At risk</MgmtTh>
              <MgmtTh>Rounds</MgmtTh>
              <MgmtTh>Staked</MgmtTh>
              <MgmtTh>Paid</MgmtTh>
              <MgmtTh>House net</MgmtTh>
              <MgmtTh>Margin</MgmtTh>
              <MgmtTh>State</MgmtTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <MgmtTd className="font-medium">{r.label}</MgmtTd>
                <MgmtTd mono>{fmt(r.livePlayers)}</MgmtTd>
                <MgmtTd mono>{fmt(r.liveRounds)}</MgmtTd>
                <MgmtTd mono>{fmt(r.liveStake)}</MgmtTd>
                <MgmtTd mono>{fmt(r.rounds)}</MgmtTd>
                <MgmtTd mono>{fmt(r.staked)}</MgmtTd>
                <MgmtTd mono>{fmt(r.paid)}</MgmtTd>
                <MgmtTd
                  mono
                  className={r.houseNet >= 0 ? "text-[var(--mgmt-ok)]" : "text-[var(--mgmt-danger)]"}
                >
                  {fmt(r.houseNet)}
                </MgmtTd>
                <MgmtTd mono>
                  {r.margin === null || r.margin === undefined ? "—" : `${Number(r.margin).toFixed(2)}%`}
                </MgmtTd>
                <MgmtTd>
                  <MgmtStatus tone={r.tone}>{r.state}</MgmtStatus>
                </MgmtTd>
              </tr>
            ))}
            <tr className="bg-[var(--mgmt-panel-2)]">
              <MgmtTd className="font-semibold">Floor total</MgmtTd>
              <MgmtTd mono>{fmt(totals.livePlayers)}</MgmtTd>
              <MgmtTd mono>{fmt(totals.liveRounds)}</MgmtTd>
              <MgmtTd mono>{fmt(totals.liveStake)}</MgmtTd>
              <MgmtTd mono>—</MgmtTd>
              <MgmtTd mono>{fmt(totals.staked)}</MgmtTd>
              <MgmtTd mono>{fmt(totals.paid)}</MgmtTd>
              <MgmtTd
                mono
                className={houseNet >= 0 ? "text-[var(--mgmt-ok)]" : "text-[var(--mgmt-danger)]"}
              >
                {fmt(houseNet)}
              </MgmtTd>
              <MgmtTd mono>{margin === null ? "—" : `${margin.toFixed(2)}%`}</MgmtTd>
              <MgmtTd>{""}</MgmtTd>
            </tr>
          </tbody>
        </MgmtTable>
      </MgmtPanel>

      <MgmtPanel title="Recent floor activity" description="Latest settled or open rounds across core tables.">
        <MgmtTable minWidth="640px">
          <thead>
            <tr>
              <MgmtTh>When</MgmtTh>
              <MgmtTh>Table</MgmtTh>
              <MgmtTh>Player</MgmtTh>
              <MgmtTh>Stake</MgmtTh>
              <MgmtTh>Payout</MgmtTh>
              <MgmtTh>Net</MgmtTh>
              <MgmtTh>Result</MgmtTh>
            </tr>
          </thead>
          <tbody>
            {activity.length === 0 ? (
              <tr>
                <MgmtTd className="text-[var(--mgmt-muted)]">
                  No recent activity.
                </MgmtTd>
              </tr>
            ) : (
              activity.map((a) => (
                <tr key={`${a.game}-${a.id}`}>
                  <MgmtTd mono>{new Date(a.createdAt).toLocaleTimeString()}</MgmtTd>
                  <MgmtTd>{a.game}</MgmtTd>
                  <MgmtTd>{a.username ?? a.userId.slice(0, 8)}</MgmtTd>
                  <MgmtTd mono>{fmt(a.stake)}</MgmtTd>
                  <MgmtTd mono>{fmt(a.payout)}</MgmtTd>
                  <MgmtTd
                    mono
                    className={a.payout - a.stake >= 0 ? "text-[var(--mgmt-ok)]" : "text-[var(--mgmt-danger)]"}
                  >
                    {fmt(a.payout - a.stake)}
                  </MgmtTd>
                  <MgmtTd>{a.result ?? "—"}</MgmtTd>
                </tr>
              ))
            )}
          </tbody>
        </MgmtTable>
      </MgmtPanel>
    </div>
  );
}

type PublishPayload = {
  game: "roulette" | "rps" | "treasure";
  difficulty?: string;
  patch: Record<string, string | number | boolean | number[]>;
  reason: string;
};

function CoreGameDesk({
  game,
  configs,
  rounds,
  loading,
  onPublish,
}: {
  game: ArcadeGame;
  configs: any;
  rounds: any[];
  loading: boolean;
  onPublish: (p: PublishPayload) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {game === "blackjack" ? (
        <MgmtPanel title="Blackjack desk">
          <p className="text-sm text-[var(--mgmt-muted)]">
            Hand voiding, maintenance and suspicious win-rate review live on the dedicated blackjack desk.
          </p>
          <div className="mt-3">
            <Link to="/management/admin/blackjack">
              <MgmtBtn variant="primary">Open blackjack desk</MgmtBtn>
            </Link>
          </div>
        </MgmtPanel>
      ) : null}

      {game === "plinko" ? (
        <MgmtPanel
          title="Plinko payout profiles"
          description="Active score tables by rows / risk. Promotion stays in the config registry."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(configs?.plinkoProfiles ?? []).map((p: any) => (
              <MgmtKpi
                key={p.id}
                label={`${p.rows} rows · ${p.risk_mode}`}
                value={`v${p.version}`}
              />
            ))}
          </div>
        </MgmtPanel>
      ) : null}

      {game === "roulette" && configs?.roulette ? (
        <RiskConfigEditor
          title={`Roulette · active v${configs.roulette.version}`}
          maintenance={!!configs.roulette.maintenance_mode}
          announcement={configs.roulette.announcement ?? ""}
          fields={[
            { key: "min_total_stake", label: "Min total stake", value: configs.roulette.min_total_stake },
            { key: "max_total_stake", label: "Max total stake", value: configs.roulette.max_total_stake },
            {
              key: "max_stake_per_position",
              label: "Max / position",
              value: configs.roulette.max_stake_per_position,
            },
            { key: "max_positions", label: "Max positions", value: configs.roulette.max_positions },
            { key: "daily_spin_limit", label: "Daily spin limit", value: configs.roulette.daily_spin_limit },
            { key: "cooldown_seconds", label: "Cooldown (s)", value: configs.roulette.cooldown_seconds },
          ]}
          onSubmit={(patch, reason) => onPublish({ game: "roulette", patch, reason })}
          onToggleMaintenance={(on, reason) =>
            onPublish({ game: "roulette", patch: { maintenance_mode: on }, reason })
          }
        />
      ) : null}

      {game === "rps" && configs?.rps ? (
        <RiskConfigEditor
          title={`Rock–Paper–Scissors · active v${configs.rps.version}`}
          maintenance={!!configs.rps.maintenance_mode}
          announcement={configs.rps.announcement ?? ""}
          note={`Ladder ${(configs.rps.ladder_multipliers ?? []).join(" → ")} then ×${configs.rps.ladder_tail_multiplier}`}
          fields={[
            { key: "min_stake", label: "Min stake", value: configs.rps.min_stake },
            { key: "max_stake", label: "Max stake", value: configs.rps.max_stake },
            { key: "win_multiplier", label: "Win mult", value: configs.rps.win_multiplier },
            { key: "draw_multiplier", label: "Draw mult", value: configs.rps.draw_multiplier },
            {
              key: "ladder_tail_multiplier",
              label: "Ladder tail",
              value: configs.rps.ladder_tail_multiplier,
            },
            { key: "daily_round_limit", label: "Daily rounds", value: configs.rps.daily_round_limit },
            { key: "cooldown_seconds", label: "Cooldown (s)", value: configs.rps.cooldown_seconds },
            { key: "round_ttl_seconds", label: "Round TTL (s)", value: configs.rps.round_ttl_seconds },
          ]}
          onSubmit={(patch, reason) => onPublish({ game: "rps", patch, reason })}
          onToggleMaintenance={(on, reason) =>
            onPublish({ game: "rps", patch: { maintenance_mode: on }, reason })
          }
        />
      ) : null}

      {game === "treasure"
        ? (configs?.treasure ?? []).map((c: any) => (
            <RiskConfigEditor
              key={c.id}
              title={`Treasure · ${c.label ?? c.difficulty} (v${c.version})`}
              maintenance={!!c.maintenance_mode}
              note={`House edge ${(100 - Number(c.target_rtp) * 100).toFixed(2)}% · grid ${c.grid_rows}×${c.grid_cols} · max ×${c.max_multiplier}`}
              fields={[
                { key: "target_rtp", label: "Target RTP", value: c.target_rtp },
                { key: "trap_count", label: "Traps", value: c.trap_count },
                { key: "min_stake", label: "Min stake", value: c.min_stake },
                { key: "max_stake", label: "Max stake", value: c.max_stake },
                { key: "max_return", label: "Max return", value: c.max_return },
                { key: "daily_round_limit", label: "Daily rounds", value: c.daily_round_limit },
                { key: "cooldown_seconds", label: "Cooldown (s)", value: c.cooldown_seconds },
                { key: "round_timeout_seconds", label: "Timeout (s)", value: c.round_timeout_seconds },
              ]}
              onSubmit={(patch, reason) =>
                onPublish({ game: "treasure", difficulty: c.difficulty, patch, reason })
              }
              onToggleMaintenance={(on, reason) =>
                onPublish({
                  game: "treasure",
                  difficulty: c.difficulty,
                  patch: { maintenance_mode: on },
                  reason,
                })
              }
            />
          ))
        : null}

      <MgmtPanel title="Recent rounds">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--mgmt-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <RoundsTable rows={rounds} />
        )}
      </MgmtPanel>
    </div>
  );
}

function MiniGameDesk({
  product,
  overview,
  loading,
  onPublish,
}: {
  product: MiniAdminProduct;
  overview: any;
  loading: boolean;
  onPublish: (patch: Record<string, string | number | boolean>, reason: string) => Promise<void>;
}) {
  const cfg = (overview?.configs ?? []).find((c: any) => c.product === product) ?? null;
  const recent = (overview?.recent ?? []).filter((r: any) => r.product === product);
  const stats = (overview?.stats ?? []).find((s: any) => s.product === product);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MgmtKpi label="Live players" value={fmt(stats?.livePlayers)} />
        <MgmtKpi label="Open rounds" value={fmt(stats?.liveRounds)} />
        <MgmtKpi label="Stake at risk" value={fmt(stats?.liveStake, 2)} />
        <MgmtKpi
          label="House net"
          value={fmt(stats?.houseNet, 2)}
          tone={(stats?.houseNet ?? 0) >= 0 ? "ok" : "bad"}
        />
        <MgmtKpi
          label="Margin"
          value={stats?.margin == null ? "—" : `${(stats.margin * 100).toFixed(2)}%`}
        />
      </div>

      {!cfg ? (
        <MgmtPanel title={`${MINI_LABELS[product]} risk`}>
          <p className="text-sm text-[var(--mgmt-muted)]">No active config published.</p>
        </MgmtPanel>
      ) : (
        <RiskConfigEditor
          title={`${MINI_LABELS[product]} · active v${cfg.version}`}
          maintenance={!!cfg.maintenance_mode}
          announcement={cfg.announcement ?? ""}
          note={`Target RTP ${(Number(cfg.target_rtp) * 100).toFixed(2)}%`}
          fields={[
            { key: "min_stake", label: "Min stake", value: cfg.min_stake },
            { key: "max_stake", label: "Max stake", value: cfg.max_stake },
            { key: "max_multiplier", label: "Max multiplier", value: cfg.max_multiplier },
            { key: "daily_round_limit", label: "Daily rounds", value: cfg.daily_round_limit },
            { key: "cooldown_seconds", label: "Cooldown (s)", value: cfg.cooldown_seconds },
            { key: "round_ttl_seconds", label: "Round TTL (s)", value: cfg.round_ttl_seconds },
            { key: "target_rtp", label: "Target RTP", value: cfg.target_rtp },
          ]}
          onSubmit={onPublish}
          onToggleMaintenance={(on, reason) => onPublish({ maintenance_mode: on }, reason)}
        />
      )}

      <MgmtPanel title={`${MINI_LABELS[product]} · recent rounds`}>
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-[var(--mgmt-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <RoundsTable
            rows={recent.map((r: any) => ({
              id: r.id,
              createdAt: r.createdAt,
              username: r.username,
              userId: r.userId,
              stake: r.stake,
              payout: r.payout,
              result: r.result,
            }))}
          />
        )}
      </MgmtPanel>
    </div>
  );
}

function RoundsTable({
  rows,
}: {
  rows: Array<{
    id: string;
    createdAt: string;
    username: string | null;
    userId: string;
    stake: number;
    payout: number;
    result: string | null;
  }>;
}) {
  return (
    <MgmtTable minWidth="560px">
      <thead>
        <tr>
          <MgmtTh>When</MgmtTh>
          <MgmtTh>Player</MgmtTh>
          <MgmtTh>Stake</MgmtTh>
          <MgmtTh>Payout</MgmtTh>
          <MgmtTh>Net</MgmtTh>
          <MgmtTh>Result</MgmtTh>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <MgmtTd className="text-[var(--mgmt-muted)]">No rounds yet.</MgmtTd>
          </tr>
        ) : (
          rows.map((r) => (
            <tr key={r.id}>
              <MgmtTd mono>{new Date(r.createdAt).toLocaleString()}</MgmtTd>
              <MgmtTd>{r.username ?? r.userId.slice(0, 8)}</MgmtTd>
              <MgmtTd mono>{fmt(r.stake, 2)}</MgmtTd>
              <MgmtTd mono>{fmt(r.payout, 2)}</MgmtTd>
              <MgmtTd
                mono
                className={r.payout - r.stake >= 0 ? "text-[var(--mgmt-ok)]" : "text-[var(--mgmt-danger)]"}
              >
                {fmt(r.payout - r.stake, 2)}
              </MgmtTd>
              <MgmtTd>{r.result ?? "—"}</MgmtTd>
            </tr>
          ))
        )}
      </tbody>
    </MgmtTable>
  );
}

function RiskConfigEditor({
  title,
  fields,
  note,
  maintenance,
  announcement,
  onSubmit,
  onToggleMaintenance,
}: {
  title: string;
  fields: { key: string; label: string; value: number | null }[];
  note?: string;
  maintenance: boolean;
  announcement?: string;
  onSubmit: (patch: Record<string, number | string | boolean>, reason: string) => Promise<void>;
  onToggleMaintenance: (on: boolean, reason: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [ann, setAnn] = useState(announcement ?? "");
  const [reason, setReason] = useState("");

  const publish = useMutation({
    mutationFn: async () => {
      const patch: Record<string, number | string | boolean> = {};
      for (const f of fields) {
        const v = draft[f.key];
        if (v !== undefined && v !== "" && Number(v) !== Number(f.value)) patch[f.key] = Number(v);
      }
      if (announcement !== undefined && ann !== (announcement ?? "")) patch.announcement = ann;
      if (Object.keys(patch).length === 0) throw new Error("No changes to publish");
      if (reason.trim().length < 4) throw new Error("Reason required (min 4 chars)");
      await onSubmit(patch, reason.trim());
      setDraft({});
      setReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed"),
  });

  const kill = useMutation({
    mutationFn: async () => {
      const r = maintenance ? "Admin resumed table" : "Admin paused table — kill switch";
      await onToggleMaintenance(!maintenance, r);
    },
    onSuccess: () => toast.success(maintenance ? "Table resumed" : "Table paused"),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <MgmtPanel
      title={title}
      description={note}
      actions={
        <div className="flex items-center gap-2">
          <MgmtStatus tone={maintenance ? "warn" : "ok"}>
            {maintenance ? "Paused" : "Live"}
          </MgmtStatus>
          <MgmtBtn
            variant={maintenance ? "primary" : "danger"}
            disabled={kill.isPending}
            onClick={() => kill.mutate()}
          >
            {kill.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {maintenance ? "Resume table" : "Pause table"}
          </MgmtBtn>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <MgmtField key={f.key} label={f.label}>
            <input
              className={mgmtInputClass}
              inputMode="decimal"
              value={draft[f.key] ?? String(f.value ?? "")}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          </MgmtField>
        ))}
      </div>

      {announcement !== undefined ? (
        <div className="mt-3">
          <MgmtField label="Player announcement">
            <input
              className={mgmtInputClass}
              value={ann}
              onChange={(e) => setAnn(e.target.value)}
              placeholder="Shown on table when set"
            />
          </MgmtField>
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className={`${mgmtInputClass} flex-1`}
          placeholder="Audit reason for this change"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <MgmtBtn variant="primary" disabled={publish.isPending} onClick={() => publish.mutate()}>
          {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Publish version
        </MgmtBtn>
      </div>
    </MgmtPanel>
  );
}
