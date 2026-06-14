import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAdminReview } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/management/admin/review")({
  head: () => ({ meta: [{ title: "Admin review — Admin" }] }),
  component: ReviewPage,
});

function ReviewPage() {
  const fn = useServerFn(listAdminReview);
  const hasSession = useHasSession();
  const [action, setAction] = useState<string>("");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin-review", action],
    queryFn: () => withSession(() => fn({ data: { action: action || undefined } })),
    enabled: hasSession === true,
  });

  const filtered = (q.data?.entries ?? []).filter((e: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [e.action, e.staff_name, e.subject_name, e.reason].some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Admin action review</h1>
        <p className="text-sm text-muted-foreground">Sensitive staff actions across wallet, payouts, points, settlement and risk.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select value={action || "__all"} onValueChange={(v) => setAction(v === "__all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="All actions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All actions</SelectItem>
              {(q.data?.actions ?? []).map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input placeholder="Search staff, subject, reason…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs font-mono">{e.action}</TableCell>
                <TableCell className="text-xs">{e.staff_name}</TableCell>
                <TableCell className="text-xs">{e.subject_name}</TableCell>
                <TableCell className="text-xs tabular-nums">{e.amount != null ? e.amount.toFixed(2) : "—"}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate" title={e.reason ?? ""}>{e.reason ?? "—"}</TableCell>
              </TableRow>
            ))}
            {!filtered.length && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No entries.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
