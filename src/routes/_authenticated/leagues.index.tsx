import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createLeague, joinLeagueByCode, listMyLeagues } from "@/lib/leagues.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/leagues/")({
  head: () => ({
    meta: [
      { title: "Leagues — CSSEBets" },
      {
        name: "description",
        content: "Create a private league with friends or join with an invite code.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    join: typeof s.join === "string" && s.join.trim() ? s.join.trim().toUpperCase() : undefined,
  }),
  component: LeaguesIndexPage,
});

function LeaguesIndexPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { join: joinParam } = Route.useSearch();
  const listFn = useServerFn(listMyLeagues);
  const createFn = useServerFn(createLeague);
  const joinFn = useServerFn(joinLeagueByCode);

  const [name, setName] = useState("");
  const [code, setCode] = useState(joinParam ?? "");
  const autoJoinTried = useRef(false);

  const q = useQuery({
    queryKey: ["my-leagues"],
    queryFn: () => listFn({}),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { name } }),
    onSuccess: (res) => {
      toast.success("League created");
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      navigate({ to: "/leagues/$leagueId", params: { leagueId: res.league.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not create league"),
  });

  const joinMut = useMutation({
    mutationFn: (joinCode: string) => joinFn({ data: { code: joinCode } }),
    onSuccess: (res) => {
      toast.success(`Joined ${res.league.name}`);
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      navigate({ to: "/leagues/$leagueId", params: { leagueId: res.league.id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not join league"),
  });

  useEffect(() => {
    if (joinParam) setCode(joinParam);
  }, [joinParam]);

  useEffect(() => {
    if (!joinParam || joinParam.length < 4 || autoJoinTried.current || joinMut.isPending) return;
    autoJoinTried.current = true;
    joinMut.mutate(joinParam);
  }, [joinParam]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-3 py-6">
      <div>
        <h1 className="font-display text-2xl font-black tracking-tight">Leagues</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Private clubs for friends. Standings combine World Cup predictions with multi-sport net P/L.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/40 p-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Create
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="League name"
            maxLength={48}
          />
          <Button
            disabled={name.trim().length < 2 || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Create
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/40 p-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Join with code
        </h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            maxLength={16}
            className="font-mono uppercase"
          />
          <Button
            disabled={code.trim().length < 4 || joinMut.isPending}
            onClick={() => joinMut.mutate(code)}
          >
            {joinMut.isPending ? "Joining…" : "Join"}
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          Your leagues
        </h2>
        <ul className="space-y-2">
          {(q.data?.leagues ?? []).map((l: { id: string; name: string; inviteCode: string | null }) => (
            <li key={l.id}>
              <Link
                to="/leagues/$leagueId"
                params={{ leagueId: l.id }}
                className="flex items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/40 px-4 py-3 transition-colors hover:border-[var(--color-neon)]/40"
              >
                <span className="font-display font-bold">{l.name}</span>
                <span className="font-mono text-[11px] text-[var(--color-ink-muted)]">
                  {l.inviteCode ?? "—"}
                </span>
              </Link>
            </li>
          ))}
          {!q.isLoading && !(q.data?.leagues ?? []).length && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No leagues yet — create one or join with a code.
            </p>
          )}
        </ul>
      </section>
    </div>
  );
}
