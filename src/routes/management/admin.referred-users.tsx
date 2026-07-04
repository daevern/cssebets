import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListReferredUsers } from "@/lib/engagement.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download } from "lucide-react";

export const Route = createFileRoute("/management/admin/referred-users")({
  head: () => ({ meta: [{ title: "Referred users — cssebets" }] }),
  component: AdminReferredUsersPage,
});

function AdminReferredUsersPage() {
  const [search, setSearch] = useState("");
  const fn = useServerFn(adminListReferredUsers);
  const q = useQuery({
    queryKey: ["admin-referred-users", search],
    queryFn: () => fn({ data: { search: search.trim() || undefined } }),
    refetchInterval: 30_000,
  });

  const rows = q.data?.rows ?? [];

  function exportCsv() {
    const header = ["created_at", "user_id", "display_name", "referred_by_code", "referrer_name", "referrer_id",
      "stage1", "stage2", "stage3", "tokens_awarded", "wagered", "flagged"];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r: any) =>
      [r.created_at, r.id, r.display_name, r.referred_by_code, r.referrer_name, r.referrer_id,
        r.stage1, r.stage2, r.stage3, r.tokens_awarded, r.wagered, r.flagged].map(escape).join(","),
    ).join("\n");
    const blob = new Blob([header.join(",") + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referred-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Referred users</h1>
          <p className="text-sm text-muted-foreground">
            New signups grouped by whose referral link they used.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ["New users", q.data?.stats.total ?? 0],
          ["Unique referrers", q.data?.stats.uniqueReferrers ?? 0],
          ["Active (stage 1)", q.data?.stats.active ?? 0],
          ["Tokens awarded", q.data?.stats.tokensAwarded ?? 0],
        ].map(([k, v]) => (
          <Card key={k as string} className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground">{k as string}</div>
            <div className="font-mono text-2xl font-bold">{(v as number).toLocaleString()}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <Input placeholder="Search by user name"
               value={search} onChange={(e) => setSearch(e.target.value)} className="md:max-w-sm" />

        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joined</TableHead>
                  <TableHead>New user</TableHead>
                  <TableHead>Referred by</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead className="text-right">Wagered</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{r.display_name}</TableCell>
                    <TableCell className="text-xs">
                      <span className="text-[var(--color-neon)] font-semibold">
                        Referral: {r.referrer_name}
                      </span>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono">{r.referred_by_code}</TableCell>
                    <TableCell className="text-[10px]">
                      {r.stage1 ? "1✓" : "1·"} {r.stage2 ? "2✓" : "2·"} {r.stage3 ? "3✓" : "3·"}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Number(r.wagered).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-[var(--color-neon)]">
                      {Number(r.tokens_awarded).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {r.flagged
                        ? <Badge variant="destructive" className="text-[10px]">Flagged</Badge>
                        : <Badge variant="outline" className="text-[10px]">OK</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No referred users yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
