import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Timer, Trophy, Loader2 } from "lucide-react";
import { getF1LiveRaceState } from "../f1.functions";

export function LiveRaceStats({ raceId }: { raceId: string }) {
  const fn = useServerFn(getF1LiveRaceState);
  const q = useQuery({
    queryKey: ["f1-live-state", raceId],
    queryFn: () => fn({ data: { raceId } }),
    refetchInterval: 20_000,
  });

  const state: any = q.data?.state;
  const standings: any[] = state?.standings ?? [];

  return (
    <section className="mb-4 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-red-400">
            Live · Race in progress
          </span>
        </div>
        {q.isFetching && <Loader2 className="h-3 w-3 animate-spin text-white/50" />}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat icon={<Flag className="h-3 w-3" />} label="Lap" value={state?.lap_current ? String(state.lap_current) : "—"} />
        <Stat
          icon={<Timer className="h-3 w-3" />}
          label="Fastest"
          value={state?.fastest_lap?.time ?? "—"}
          sub={state?.fastest_lap?.driver_name ?? undefined}
        />
        <Stat icon={<Trophy className="h-3 w-3" />} label="Leader" value={standings[0]?.driver_name ?? "—"} />
      </div>

      {standings.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-white/10">
          <table className="w-full text-[12px]">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase tracking-wider text-white/50">
                <th className="w-8 px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Driver</th>
                <th className="hidden px-2 py-1.5 sm:table-cell">Team</th>
                <th className="px-2 py-1.5 text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {standings.slice(0, 15).map((s: any) => (
                <tr key={`${s.position}-${s.driver_id}`} className="border-t border-white/5">
                  <td className="px-2 py-1.5 font-mono font-bold text-white/70">{s.position ?? "—"}</td>
                  <td className="truncate px-2 py-1.5 font-semibold text-white">{s.driver_name ?? "—"}</td>
                  <td className="hidden truncate px-2 py-1.5 text-white/60 sm:table-cell">{s.team_name ?? ""}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-white/80">
                    {s.position === 1 ? "Leader" : s.gap ?? s.time ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-white/10 bg-black/40 px-3 py-4 text-center text-[11px] text-white/60">
          {q.isLoading ? "Loading live standings…" : "Live standings will appear once the FIA feed publishes lap 1."}
        </div>
      )}
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-display text-sm font-bold text-white">{value}</div>
      {sub && <div className="truncate text-[10px] text-white/50">{sub}</div>}
    </div>
  );
}
