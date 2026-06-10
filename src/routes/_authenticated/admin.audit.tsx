import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAuditLog } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AdminAuditPage,
});

function AdminAuditPage() {
  const [action, setAction] = useState("");
  const fn = useServerFn(listAuditLog);
  const q = useQuery({
    queryKey: ["admin-audit", action],
    queryFn: () => fn({ data: { action: action || undefined } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every admin action with reason, old and new values.</p>
      </div>
      <Card className="p-4 space-y-3">
        <Input placeholder="Filter by action (e.g. user.suspend)" value={action} onChange={(e) => setAction(e.target.value)} className="md:max-w-sm" />
        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Old → New</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(q.data?.entries ?? []).map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{e.admin_name}</TableCell>
                    <TableCell className="text-xs font-mono">{e.action}</TableCell>
                    <TableCell className="text-xs">
                      {e.entity}
                      {e.entity_id && <span className="block text-muted-foreground">{String(e.entity_id).slice(0, 8)}</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={e.reason ?? ""}>{e.reason ?? "—"}</TableCell>
                    <TableCell className="text-[10px] font-mono">
                      {e.old_value || e.new_value ? (
                        <>
                          <div className="text-muted-foreground truncate max-w-[200px]">{e.old_value ? JSON.stringify(e.old_value) : "—"}</div>
                          <div className="truncate max-w-[200px]">{e.new_value ? JSON.stringify(e.new_value) : "—"}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!q.data?.entries?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No entries.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
