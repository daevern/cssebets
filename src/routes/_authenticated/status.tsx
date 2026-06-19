import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/ui/page-shell";
import { StatusGrid } from "@/components/trust/StatusGrid";

export const Route = createFileRoute("/_authenticated/status")({
  head: () => ({
    meta: [
      { title: "Platform Status — cssebets" },
      { name: "description", content: "Live operational status for the CSSEBets platform, derived from real health checks." },
    ],
  }),
  component: StatusPage,
});

function StatusPage() {
  return (
    <PageShell kicker="System Status" title="Platform" titleAccent="Status" wide>
      <StatusGrid />
    </PageShell>
  );
}
