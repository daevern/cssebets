import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gamepad2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export const Route = createFileRoute("/management/admin/arcade")({
  head: () => ({
    meta: [
      { title: "Arcade control centre — Admin | cssebets" },
      {
        name: "description",
        content:
          "Live arcade oversight: players in play, stake at risk, house margin per game and versioned config controls.",
      },
    ],
  }),
  component: AdminArcadePage,
});

const GAMES: { id: ArcadeGame; label: string }[] = [
  { id: "plinko", label: "Plinko" },
  { id: "roulette", label: "Mini Roulette" },
  { id: "treasure", label: "Treasure Grid" },
  { id: "blackjack", label: "Blackjack" },
  { id: "rps", label: "Rock–Paper–Scissors" },
];

const WINDOWS = [
  { h: 24, label: "24h" },
  { h: 168, label: "7d" },
  { h: 720, label: "30d" },
];

const fmt = (n: number | null | undefined, d = 0) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div
        className={`font-mono text-lg font-bold tabular-nums ${
          tone === "good"
            ? "text-emerald-400"
            : tone === "bad"
              ? "text-red-400"
              : "text-[var(--color-ink)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function AdminArcadePage() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const enabled = hasSession === true;

  const snapshotFn = useServerFn(arcadeAdminSnapshot);
  const configsFn = useServerFn(arcadeAdminConfigs);
  const roundsFn = useServerFn(arcadeAdminRounds);
  const publishFn = useServerFn(arcadeAdminPublishConfig);

  const [windowHours, setWindowHours] = useState(24);
  const [tab, setTab] = useState<"overview" | ArcadeGame>("overview");

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

  const rounds = useQuery({
    queryKey: ["arcade-admin", "rounds", tab],
    queryFn: () => roundsFn({ data: { game: tab as ArcadeGame, limit: 50 } }),
    enabled: enabled && tab !== "overview",
    refetchInterval: 10000,
  });

  const totals = useMemo(() => {
    const g = snap.data?.games ?? [];
    return {
      livePlayers: g.reduce((a, x) => a + x.livePlayers, 0),
      liveRounds: g.reduce((a, x) => a + x.liveRounds, 0),
      liveStake: g.reduce((a, x) => a + x.liveStake, 0),
      reserved: g.reduce((a, x) => a + x.reserved, 0),
      staked: g.reduce((a, x) => a + x.staked, 0),
      paid: g.reduce((a, x) => a + x.paid, 0),
    };
  }, [snap.data]);

  if (hasSession === false) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--color-ink-muted)]">
        <ShieldAlert className="h-4 w-4" /> Staff session required.
      </div>
    );
  }

  const margin = totals.staked > 0 ? ((totals.staked - totals.paid) / totals.staked) * 100 : null;

  return (
    <div className="space-y-6 p-3 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-[var(--color-accent,#22d3ee)]" />
          <h1 className="text-lg font-bold text-[var(--color-ink)]">Arcade control centre</h1>
        </div>
        <div className="flex items-center gap-1">
          {WINDOWS.map((w) => (
            <Button
              key={w.h}
              size="sm"
              variant={windowHours === w.h ? "default" : "outline"}
              onClick={() => setWindowHours(w.h)}
            >
              {w.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["arcade-admin"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <Section title="Live now (refreshes every 5s)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Players in play" value={fmt(totals.livePlayers)} />
          <Stat label="Open rounds" value={fmt(totals.liveRounds)} />
          <Stat label="Stake at risk" value={fmt(totals.liveStake)} />
          <Stat label="Reserved liability" value={fmt(totals.reserved)} />
          <Stat
            label="Available reserve"
            value={fmt(snap.data?.availableReserve ?? null)}
            tone={(snap.data?.availableReserve ?? 1) <= 0 ? "bad" : undefined}
          />
        </div>
      </Section>

      <div className="flex flex-wrap gap-1 border-b border-[var(--color-surface-border)] pb-2">
        <Button
          size="sm"
          variant={tab === "overview" ? "default" : "ghost"}
          onClick={() => setTab("overview")}
        >
          Overview
        </Button>
        {GAMES.map((g) => (
          <Button
            key={g.id}
            size="sm"
            variant={tab === g.id ? "default" : "ghost"}
            onClick={() => setTab(g.id)}
          >
            {g.label}
          </Button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <Section title={`Per game — last ${snap.data?.windowHours ?? windowHours}h`}>
            <div className="overflow-x-auto border border-[var(--color-surface-border)]">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]">
                  <tr className="text-left">
                    <th className="px-2 py-2">Game</th>
                    <th className="px-2 py-2">Live players</th>
                    <th className="px-2 py-2">Open rounds</th>
                    <th className="px-2 py-2">Stake at risk</th>
                    <th className="px-2 py-2">Reserved</th>
                    <th className="px-2 py-2">Rounds</th>
                    <th className="px-2 py-2">Players</th>
                    <th className="px-2 py-2">Staked</th>
                    <th className="px-2 py-2">Paid</th>
                    <th className="px-2 py-2">House net</th>
                    <th className="px-2 py-2">Margin</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {(snap.data?.games ?? []).map((g) => (
                    <tr key={g.game} className="border-t border-[var(--color-surface-border)]">
                      <td className="px-2 py-2 font-sans font-semibold text-[var(--color-ink)]">
                        {GAMES.find((x) => x.id === g.game)?.label ?? g.game}
                      </td>
                      <td className="px-2 py-2">{fmt(g.livePlayers)}</td>
                      <td className="px-2 py-2">{fmt(g.liveRounds)}</td>
                      <td className="px-2 py-2">{fmt(g.liveStake)}</td>
                      <td className="px-2 py-2">{fmt(g.reserved)}</td>
                      <td className="px-2 py-2">{fmt(g.rounds)}</td>
                      <td className="px-2 py-2">{fmt(g.players)}</td>
                      <td className="px-2 py-2">{fmt(g.staked)}</td>
                      <td className="px-2 py-2">{fmt(g.paid)}</td>
                      <td
                        className={`px-2 py-2 ${g.houseNet >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {fmt(g.houseNet)}
                      </td>
                      <td className="px-2 py-2">{g.margin === null ? "—" : `${g.margin}%`}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
                    <td className="px-2 py-2 font-sans font-bold text-[var(--color-ink)]">Total</td>
                    <td className="px-2 py-2">{fmt(totals.livePlayers)}</td>
                    <td className="px-2 py-2">{fmt(totals.liveRounds)}</td>
                    <td className="px-2 py-2">{fmt(totals.liveStake)}</td>
                    <td className="px-2 py-2">{fmt(totals.reserved)}</td>
                    <td className="px-2 py-2" colSpan={2} />
                    <td className="px-2 py-2">{fmt(totals.staked)}</td>
                    <td className="px-2 py-2">{fmt(totals.paid)}</td>
                    <td
                      className={`px-2 py-2 ${totals.staked - totals.paid >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {fmt(totals.staked - totals.paid)}
                    </td>
                    <td className="px-2 py-2">{margin === null ? "—" : `${margin.toFixed(2)}%`}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Recent activity">
            <div className="overflow-x-auto border border-[var(--color-surface-border)]">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]">
                  <tr className="text-left">
                    <th className="px-2 py-2">When</th>
                    <th className="px-2 py-2">Game</th>
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2">Stake</th>
                    <th className="px-2 py-2">Payout</th>
                    <th className="px-2 py-2">Net</th>
                    <th className="px-2 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular-nums">
                  {(snap.data?.activity ?? []).map((a) => (
                    <tr key={`${a.game}-${a.id}`} className="border-t border-[var(--color-surface-border)]">
                      <td className="px-2 py-1.5">{new Date(a.createdAt).toLocaleTimeString()}</td>
                      <td className="px-2 py-1.5 font-sans">{a.game}</td>
                      <td className="px-2 py-1.5 font-sans">{a.username ?? a.userId.slice(0, 8)}</td>
                      <td className="px-2 py-1.5">{fmt(a.stake)}</td>
                      <td className="px-2 py-1.5">{fmt(a.payout)}</td>
                      <td
                        className={`px-2 py-1.5 ${a.payout - a.stake >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {fmt(a.payout - a.stake)}
                      </td>
                      <td className="px-2 py-1.5 font-sans">{a.result ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <MiniEngineSection windowHours={windowHours} enabled={enabled} />
        </>

      ) : (
        <GameTab
          game={tab}
          configs={configs.data}
          rounds={rounds.data ?? []}
          loading={rounds.isLoading || configs.isLoading}
          onPublish={async (payload) => {
            await publishFn({ data: payload });
            toast.success("New config version published");
            qc.invalidateQueries({ queryKey: ["arcade-admin"] });
          }}
        />
      )}
    </div>
  );
}

type PublishPayload = {
  game: "roulette" | "rps" | "treasure";
  difficulty?: string;
  patch: Record<string, string | number | boolean | number[]>;
  reason: string;
};

function GameTab({
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
    <div className="space-y-6">
      {game === "blackjack" ? (
        <div className="border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-ink-muted)]">
          Blackjack rules, scoring and hand resolution live on the dedicated page.{" "}
          <Link
            to="/management/admin/blackjack"
            className="font-semibold text-[var(--color-accent,#22d3ee)] underline"
          >
            Open Blackjack admin
          </Link>
        </div>
      ) : null}

      {game === "plinko" ? (
        <Section title="Active score profiles">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(configs?.plinkoProfiles ?? []).map((p: any) => (
              <Stat key={p.id} label={`${p.rows} rows · ${p.risk_mode}`} value={`v${p.version}`} />
            ))}
          </div>
          <p className="text-[11px] text-[var(--color-ink-muted)]">
            Plinko payout tables are versioned per rows/risk profile and promoted through the config
            registry — they are read-only here by design.
          </p>
        </Section>
      ) : null}

      {game === "roulette" && configs?.roulette ? (
        <ConfigEditor
          title={`Mini Roulette — active v${configs.roulette.version}`}
          fields={[
            { key: "min_total_stake", label: "Min total stake", value: configs.roulette.min_total_stake },
            { key: "max_total_stake", label: "Max total stake", value: configs.roulette.max_total_stake },
            {
              key: "max_stake_per_position",
              label: "Max stake / position",
              value: configs.roulette.max_stake_per_position,
            },
            { key: "max_positions", label: "Max positions", value: configs.roulette.max_positions },
            { key: "daily_spin_limit", label: "Daily spin limit", value: configs.roulette.daily_spin_limit },
            { key: "cooldown_seconds", label: "Cooldown (s)", value: configs.roulette.cooldown_seconds },
          ]}
          onSubmit={(patch, reason) => onPublish({ game: "roulette", patch, reason })}
        />
      ) : null}

      {game === "rps" && configs?.rps ? (
        <ConfigEditor
          title={`Rock–Paper–Scissors — active v${configs.rps.version}`}
          fields={[
            { key: "min_stake", label: "Min stake", value: configs.rps.min_stake },
            { key: "max_stake", label: "Max stake", value: configs.rps.max_stake },
            { key: "win_multiplier", label: "Win multiplier", value: configs.rps.win_multiplier },
            { key: "draw_multiplier", label: "Draw multiplier", value: configs.rps.draw_multiplier },
            {
              key: "ladder_tail_multiplier",
              label: "Ladder tail multiplier",
              value: configs.rps.ladder_tail_multiplier,
            },
            { key: "daily_round_limit", label: "Daily round limit", value: configs.rps.daily_round_limit },
          ]}
          note={`Ladder: ${(configs.rps.ladder_multipliers ?? []).join(" → ")} then ×${configs.rps.ladder_tail_multiplier}`}
          onSubmit={(patch, reason) => onPublish({ game: "rps", patch, reason })}
        />
      ) : null}

      {game === "treasure"
        ? (configs?.treasure ?? []).map((c: any) => (
            <ConfigEditor
              key={c.id}
              title={`Treasure — ${c.label ?? c.difficulty} (v${c.version})`}
              fields={[
                { key: "target_rtp", label: "Target RTP (0-1)", value: c.target_rtp },
                { key: "trap_count", label: "Trap count", value: c.trap_count },
                { key: "min_stake", label: "Min stake", value: c.min_stake },
                { key: "max_stake", label: "Max stake", value: c.max_stake },
                { key: "max_return", label: "Max return", value: c.max_return },
                { key: "daily_round_limit", label: "Daily round limit", value: c.daily_round_limit },
              ]}
              note={`House edge ${(100 - Number(c.target_rtp) * 100).toFixed(2)}% · grid ${c.grid_rows}×${c.grid_cols} · max ×${c.max_multiplier}`}
              onSubmit={(patch, reason) =>
                onPublish({ game: "treasure", difficulty: c.difficulty, patch, reason })
              }
            />
          ))
        : null}

      <Section title="Recent rounds">
        {loading ? (
          <div className="flex items-center gap-2 p-3 text-xs text-[var(--color-ink-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto border border-[var(--color-surface-border)]">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]">
                <tr className="text-left">
                  <th className="px-2 py-2">When</th>
                  <th className="px-2 py-2">Player</th>
                  <th className="px-2 py-2">Stake</th>
                  <th className="px-2 py-2">Payout</th>
                  <th className="px-2 py-2">Net</th>
                  <th className="px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {rounds.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-2 py-1.5">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-1.5 font-sans">{r.username ?? r.userId.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{fmt(r.stake)}</td>
                    <td className="px-2 py-1.5">{fmt(r.payout)}</td>
                    <td
                      className={`px-2 py-1.5 ${r.payout - r.stake >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {fmt(r.payout - r.stake)}
                    </td>
                    <td className="px-2 py-1.5 font-sans">{r.result ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function ConfigEditor({
  title,
  fields,
  note,
  onSubmit,
}: {
  title: string;
  fields: { key: string; label: string; value: number | null }[];
  note?: string;
  onSubmit: (patch: Record<string, number>, reason: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  const publish = useMutation({
    mutationFn: async () => {
      const patch: Record<string, number> = {};
      for (const f of fields) {
        const v = draft[f.key];
        if (v !== undefined && v !== "" && Number(v) !== Number(f.value)) patch[f.key] = Number(v);
      }
      if (Object.keys(patch).length === 0) throw new Error("No changes to publish");
      if (reason.trim().length < 4) throw new Error("A reason of at least 4 characters is required");
      await onSubmit(patch, reason.trim());
      setDraft({});
      setReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed"),
  });

  return (
    <Section title={title}>
      {note ? <p className="text-[11px] text-[var(--color-ink-muted)]">{note}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {fields.map((f) => (
          <label key={f.key} className="space-y-1">
            <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {f.label}
            </span>
            <Input
              inputMode="decimal"
              value={draft[f.key] ?? String(f.value ?? "")}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="font-mono"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Reason for this change (audited)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
          {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish new version"}
        </Button>
      </div>
    </Section>
  );
}

const MINI_LABELS: Record<MiniAdminProduct, string> = {
  hilo: "Hi-Lo",
  dice: "Dice",
  wheel: "Fortune Wheel",
  keno: "Keno",
  crash: "Crash",
  towers: "Dragon Towers",
  poker: "Video Poker",
};

const MINI_FIELDS: { key: string; label: string }[] = [
  { key: "min_stake", label: "Min stake" },
  { key: "max_stake", label: "Max stake" },
  { key: "max_multiplier", label: "Max multiplier" },
  { key: "daily_round_limit", label: "Daily rounds" },
  { key: "cooldown_seconds", label: "Cooldown (s)" },
  { key: "round_ttl_seconds", label: "Round TTL (s)" },
];

/** CSSE Originals mini engine — Hi-Lo, Dice, Wheel, Keno, Crash, Towers, Poker. */
function MiniEngineSection({ windowHours, enabled }: { windowHours: number; enabled: boolean }) {
  const qc = useQueryClient();
  const overviewFn = useServerFn(miniAdminOverview);
  const publishFn = useServerFn(miniAdminPublishConfig);
  const [product, setProduct] = useState<MiniAdminProduct>("towers");

  const q = useQuery({
    queryKey: ["arcade-admin", "mini", windowHours],
    queryFn: () => overviewFn({ data: { windowHours } }),
    enabled,
    refetchInterval: 8000,
  });

  const configs = (q.data?.configs ?? []) as any[];
  const cfg = configs.find((c) => c.product === product) ?? null;
  const recent = (q.data?.recent ?? []).filter((r) => r.product === product);

  const setMaintenance = useMutation({
    mutationFn: async (on: boolean) => {
      await publishFn({
        data: {
          product,
          patch: { maintenance_mode: on },
          reason: on ? "Admin paused the table" : "Admin resumed the table",
        },
      });
    },
    onSuccess: () => {
      toast.success("Published");
      qc.invalidateQueries({ queryKey: ["arcade-admin", "mini"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Publish failed"),
  });

  return (
    <>
      <Section title={`CSSE Originals — last ${q.data?.windowHours ?? windowHours}h`}>
        <div className="overflow-x-auto border border-[var(--color-surface-border)]">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]">
              <tr className="text-left">
                <th className="px-2 py-2">Game</th>
                <th className="px-2 py-2">Live players</th>
                <th className="px-2 py-2">Open rounds</th>
                <th className="px-2 py-2">Stake at risk</th>
                <th className="px-2 py-2">Rounds</th>
                <th className="px-2 py-2">Players</th>
                <th className="px-2 py-2">Staked</th>
                <th className="px-2 py-2">Paid</th>
                <th className="px-2 py-2">House net</th>
                <th className="px-2 py-2">Margin</th>
                <th className="px-2 py-2">State</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {(q.data?.stats ?? []).map((s) => {
                const c = configs.find((x) => x.product === s.product);
                return (
                  <tr key={s.product} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-2 py-2 font-sans font-semibold text-[var(--color-ink)]">
                      {MINI_LABELS[s.product]}
                    </td>
                    <td className="px-2 py-2">{fmt(s.livePlayers)}</td>
                    <td className="px-2 py-2">{fmt(s.liveRounds)}</td>
                    <td className="px-2 py-2">{fmt(s.liveStake, 2)}</td>
                    <td className="px-2 py-2">{fmt(s.rounds)}</td>
                    <td className="px-2 py-2">{fmt(s.players)}</td>
                    <td className="px-2 py-2">{fmt(s.staked, 2)}</td>
                    <td className="px-2 py-2">{fmt(s.paid, 2)}</td>
                    <td className={`px-2 py-2 ${s.houseNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {fmt(s.houseNet, 2)}
                    </td>
                    <td className="px-2 py-2">
                      {s.margin === null ? "—" : `${(s.margin * 100).toFixed(2)}%`}
                    </td>
                    <td className="px-2 py-2 font-sans">
                      {c?.maintenance_mode ? (
                        <span className="text-amber-400">Paused</span>
                      ) : (
                        <span className="text-emerald-400">Live · v{c?.version ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Originals risk controls">
        <div className="flex flex-wrap gap-1">
          {MINI_PRODUCTS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={product === p ? "default" : "ghost"}
              onClick={() => setProduct(p)}
            >
              {MINI_LABELS[p]}
            </Button>
          ))}
        </div>

        {!cfg ? (
          <p className="text-[11px] text-[var(--color-ink-muted)]">No active config published.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
              <span>
                Active v{cfg.version} · target RTP {(Number(cfg.target_rtp) * 100).toFixed(2)}%
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={setMaintenance.isPending}
                onClick={() => setMaintenance.mutate(!cfg.maintenance_mode)}
              >
                {cfg.maintenance_mode ? "Resume table" : "Pause table"}
              </Button>
            </div>

            <ConfigEditor
              title={`${MINI_LABELS[product]} limits`}
              note="Publishing retires the current version and activates a new one. Every change is audited."
              fields={MINI_FIELDS.map((f) => ({
                key: f.key,
                label: f.label,
                value: cfg[f.key] === null || cfg[f.key] === undefined ? null : Number(cfg[f.key]),
              }))}
              onSubmit={async (patch, reason) => {
                await publishFn({ data: { product, patch, reason } });
                toast.success("Published");
                qc.invalidateQueries({ queryKey: ["arcade-admin", "mini"] });
              }}
            />
          </>
        )}
      </Section>

      <Section title={`${MINI_LABELS[product]} — recent rounds`}>
        <div className="overflow-x-auto border border-[var(--color-surface-border)]">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]">
              <tr className="text-left">
                <th className="px-2 py-2">When</th>
                <th className="px-2 py-2">Player</th>
                <th className="px-2 py-2">Stake</th>
                <th className="px-2 py-2">Payout</th>
                <th className="px-2 py-2">Net</th>
                <th className="px-2 py-2">Multiplier</th>
                <th className="px-2 py-2">Result</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              {recent.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 font-sans text-[var(--color-ink-muted)]" colSpan={7}>
                    No rounds yet.
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--color-surface-border)]">
                    <td className="px-2 py-1.5">{new Date(r.createdAt).toLocaleTimeString()}</td>
                    <td className="px-2 py-1.5 font-sans">{r.username ?? r.userId.slice(0, 8)}</td>
                    <td className="px-2 py-1.5">{fmt(r.stake, 2)}</td>
                    <td className="px-2 py-1.5">{fmt(r.payout, 2)}</td>
                    <td
                      className={`px-2 py-1.5 ${r.payout - r.stake >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {fmt(r.payout - r.stake, 2)}
                    </td>
                    <td className="px-2 py-1.5">{fmt(r.multiplier, 2)}×</td>
                    <td className="px-2 py-1.5 font-sans">{r.result ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
