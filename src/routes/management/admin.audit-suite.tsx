import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runPlatformAudit, type AuditSuiteResult } from "@/lib/audit.functions";
import { withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, HelpCircle, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/management/admin/audit-suite")({
  head: () => ({ meta: [{ title: "Audit suite — Admin" }] }),
  component: AuditSuitePage,
});

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === true) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (ok === false) return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
}

function AuditSuitePage() {
  const fn = useServerFn(runPlatformAudit);
  const run = useMutation({ mutationFn: () => withSession(() => fn({})) });
  const data = run.data as { ok: boolean; startedAt: string; results: AuditSuiteResult[] } | undefined;

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Platform audit suite</h1>
            <p className="text-sm text-muted-foreground">
              Runs every accounting invariant, product lifecycle, rounding, liability and fairness check.
              All suites are read-only or roll themselves back in the simulation environment.
            </p>
          </div>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            <span className="ml-2">Run full audit</span>
          </Button>
        </div>
        {run.isError && (
          <p className="text-sm text-destructive">{(run.error as Error).message}</p>
        )}
      </Card>

      {data && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <StatusIcon ok={data.ok} />
            <span className="font-medium">{data.ok ? "All suites passed" : "Attention required"}</span>
            <span className="text-muted-foreground">· {new Date(data.startedAt).toLocaleString()}</span>
          </div>
          <div className="space-y-2">
            {data.results.map((r) => (
              <details key={r.key} className="rounded-md border border-border p-3">
                <summary className="flex cursor-pointer items-center gap-2 text-sm">
                  <StatusIcon ok={r.ok} />
                  <span className="font-medium">{r.label}</span>
                  <span className="ml-auto text-muted-foreground">{r.summary}</span>
                </summary>
                <pre className="mt-3 max-h-80 overflow-auto rounded bg-muted p-2 text-[11px] leading-relaxed">
                  {JSON.stringify(r.detail, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
