import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listWalletLedgerAdmin } from "@/lib/admin-dashboard.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download } from "lucide-react";

export const Route = createFileRoute("/management/admin/wallet-ledger")({
  component: AdminWalletLedgerPage,
});

const TYPES = ["", "debit", "credit"];

function AdminWalletLedgerPage() {
  const [type, setType] = useState("");
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const fn = useServerFn(listWalletLedgerAdmin);
  const q = useQuery({
    queryKey: ["admin-wallet-ledger", type, userId, username],
    queryFn: () =>
      fn({
        data: {
          type: type || undefined,
          userId: userId.trim().length === 36 ? userId.trim() : undefined,
          username: username.trim().length >= 2 ? username.trim() : undefined,
        },
      }),
    refetchInterval: 30_000,
  });

  const rows = q.data?.transactions ?? [];

  function exportCsv() {
    const header = [
      "created_at",
      "user_id",
      "display_name",
      "type",
      "amount",
      "balance_before",
      "balance_after",
      "reference_type",
      "reference_id",
      "note",
    ];
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows
      .map((r: any) =>
        [
          r.created_at,
          r.user_id,
          r.display_name,
          r.type,
          r.amount,
          r.balance_before,
          r.balance_after,
          r.reference_type,
          r.reference_id,
          r.note,
        ]
          .map(escape)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header.join(",") + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Wallet ledger</h1>
          <p className="text-sm text-muted-foreground">
            All credit movements.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t || "All types"}
              </option>
            ))}
          </select>
          <Input
            placeholder="Filter by username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="md:max-w-xs"
          />
          <Input
            placeholder="Filter by user UUID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="md:max-w-sm"
          />
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
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Before</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead>Note</TableHead>
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
                      <Badge variant="outline" className="uppercase text-[10px]">
                        {r.type}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right text-xs tabular-nums ${
                        r.type === "credit" ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {r.type === "credit" ? "+" : "−"}
                      {Number(r.amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {Number(r.balance_before).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {Number(r.balance_after).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">
                      <div>{r.reference_type}</div>
                      {r.reference_id && (
                        <div className="font-mono">{String(r.reference_id).slice(0, 8)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate" title={r.note ?? ""}>
                      {r.note ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
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
