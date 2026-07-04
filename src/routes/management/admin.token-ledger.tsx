import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListTokenLedger } from "@/lib/engagement.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download } from "lucide-react";

export const Route = createFileRoute("/management/admin/token-ledger")({
  head: () => ({ meta: [{ title: "Token ledger — cssebets" }] }),
  component: AdminTokenLedgerPage,
});

const KINDS = ["", "earn", "spend", "grant", "adjust", "refund"];

function AdminTokenLedgerPage() {
  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const [userId, setUserId] = useState("");
  const fn = useServerFn(adminListTokenLedger);
  const q = useQuery({
    queryKey: ["admin-token-ledger", kind, source, userId],
    queryFn: () =>
      fn({
        data: {
          kind: kind || undefined,
          source: source.trim() || undefined,
          userId: userId.trim().length === 36 ? userId.trim() : undefined,
        },
      }),
    refetchInterval: 30_000,
  });

  const rows = q.data?.transactions ?? [];

  function exportCsv() {
    const header = ["created_at", "user_id", "display_name", "kind", "source", "source_ref", "delta", "balance_after"];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r: any) =>
      [r.created_at, r.user_id, r.display_name, r.kind, r.source, r.source_ref, r.delta, r.balance_after]
        .map(escape).join(","),
    ).join("\n");
    const blob = new Blob([header.join(",") + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `token-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Token ledger</h1>
          <p className="text-sm text-muted-foreground">All CSSE token movements.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Rows</div>
          <div className="font-mono text-2xl font-bold">{rows.length.toLocaleString()}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Credited</div>
          <div className="font-mono text-2xl font-bold text-emerald-600">
            +{(q.data?.totals.credit ?? 0).toLocaleString()}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Debited</div>
          <div className="font-mono text-2xl font-bold text-red-600">
            −{(q.data?.totals.debit ?? 0).toLocaleString()}
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {KINDS.map((t) => <option key={t} value={t}>{t || "All kinds"}</option>)}
          </select>
          <Input placeholder="Filter by source (e.g. referral, store)"
                 value={source} onChange={(e) => setSource(e.target.value)} className="md:max-w-[220px]" />
          <Input placeholder="Filter by user UUID"
                 value={userId} onChange={(e) => setUserId(e.target.value)} className="md:max-w-sm" />
        </div>

        {q.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">{r.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="uppercase text-[10px]">{r.kind}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px]">{r.source ?? "—"}</TableCell>
                    <TableCell className={`text-right text-xs tabular-nums ${
                      Number(r.delta) >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}>
                      {Number(r.delta) >= 0 ? "+" : "−"}
                      {Math.abs(Number(r.delta)).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Number(r.balance_after ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {r.source_ref ? String(r.source_ref).slice(0, 12) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No transactions.
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
