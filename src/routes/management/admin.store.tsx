import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminListStoreItems, adminUpsertStoreItem, adminDeleteStoreItem, adminGrantTokens } from "@/lib/engagement.functions";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/management/admin/store")({
  component: AdminStorePage,
});

function AdminStorePage() {
  const qc = useQueryClient();
  const { isViewer } = useAuth();
  const listFn = useServerFn(adminListStoreItems);
  const upsertFn = useServerFn(adminUpsertStoreItem);
  const delFn = useServerFn(adminDeleteStoreItem);
  const grantFn = useServerFn(adminGrantTokens);

  const q = useQuery({ queryKey: ["admin-store-items"], queryFn: () => listFn() });

  const [editing, setEditing] = useState<any | null>(null);
  const [grantUser, setGrantUser] = useState("");
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");

  const upsert = useMutation({
    mutationFn: (v: any) => upsertFn({ data: v }),
    onSuccess: () => { toast.success("Saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-store-items"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-store-items"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const grant = useMutation({
    mutationFn: () => grantFn({ data: { userId: grantUser, amount: parseInt(grantAmount, 10), reason: grantReason } }),
    onSuccess: () => { toast.success("Tokens granted"); setGrantUser(""); setGrantAmount(""); setGrantReason(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CSSE Store</h1>
        <p className="text-sm text-muted-foreground">Manage free-bet items and grant tokens.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Items</div>
          <Button size="sm" disabled={isViewer} onClick={() => setEditing({
            item_key: "", kind: "free_bet", label: "", stake_amount: 0, token_price: 0, is_active: true, sort_order: 0,
          })}>New Item</Button>
        </div>
        {editing && (
          <Card className="p-3 space-y-2 border-dashed">
            <Input placeholder="item_key (e.g. fb-10)" value={editing.item_key}
                   onChange={(e) => setEditing({ ...editing, item_key: e.target.value })} />
            <Input placeholder="Label" value={editing.label}
                   onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" placeholder="Stake pts" value={editing.stake_amount}
                     onChange={(e) => setEditing({ ...editing, stake_amount: parseFloat(e.target.value || "0") })} />
              <Input type="number" placeholder="Token price" value={editing.token_price}
                     onChange={(e) => setEditing({ ...editing, token_price: parseInt(e.target.value || "0", 10) })} />
              <Input type="number" placeholder="Sort" value={editing.sort_order}
                     onChange={(e) => setEditing({ ...editing, sort_order: parseInt(e.target.value || "0", 10) })} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={editing.is_active}
                     onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
              Active
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={upsert.isPending} onClick={() => upsert.mutate(editing)}>Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </Card>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead><TableHead>Label</TableHead>
                <TableHead className="text-right">Stake</TableHead><TableHead className="text-right">Price</TableHead>
                <TableHead>Active</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.item_key}</TableCell>
                  <TableCell className="text-xs">{it.label}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{Number(it.stake_amount)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{it.token_price}</TableCell>
                  <TableCell className="text-xs">{it.is_active ? "✓" : "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="outline" disabled={isViewer} onClick={() => setEditing(it)}>Edit</Button>
                    <Button size="sm" variant="outline" disabled={isViewer || del.isPending} onClick={() => del.mutate(it.id)}>Delete</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-semibold">Grant tokens</div>
        <Input placeholder="User ID (uuid)" value={grantUser} onChange={(e) => setGrantUser(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" placeholder="Amount (±)" value={grantAmount} onChange={(e) => setGrantAmount(e.target.value)} />
          <Input placeholder="Reason" value={grantReason} onChange={(e) => setGrantReason(e.target.value)} />
        </div>
        <Button size="sm" disabled={isViewer || !grantUser || !grantAmount || !grantReason || grant.isPending}
                onClick={() => grant.mutate()}>Grant</Button>
      </Card>
    </div>
  );
}
