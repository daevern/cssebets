import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listIncidents, createIncident, updateIncident } from "@/lib/operations.functions";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/management/admin/incidents")({
  head: () => ({ meta: [{ title: "Incidents — Admin" }] }),
  component: IncidentsPage,
});

const CATEGORIES = ["wallet","settlement","odds","point_requests","payouts","support","security","other"] as const;
const SEVERITIES = ["low","medium","high","critical"] as const;
const STATUSES = ["open","investigating","resolved","closed"] as const;

function IncidentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listIncidents);
  const createFn = useServerFn(createIncident);
  const updateFn = useServerFn(updateIncident);
  const hasSession = useHasSession();

  const q = useQuery({
    queryKey: ["incidents"],
    queryFn: () => withSession(() => listFn({})),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [severity, setSeverity] = useState<string>("medium");
  const [notes, setNotes] = useState("");

  async function submit() {
    if (!title.trim()) return;
    try {
      await createFn({ data: { title, category: category as any, severity: severity as any, notes } });
      setTitle(""); setNotes("");
      toast.success("Incident created");
      qc.invalidateQueries({ queryKey: ["incidents"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function changeStatus(id: string, status: string) {
    try {
      await updateFn({ data: { id, status: status as any } });
      qc.invalidateQueries({ queryKey: ["incidents"] });
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Incidents</h1>
        <p className="text-sm text-muted-foreground">Track and resolve operational incidents.</p>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold">New incident</h2>
        <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <Button onClick={submit}>Create incident</Button>
      </Card>

      <Card className="p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(q.data?.incidents ?? []).map((i: any) => (
              <TableRow key={i.id}>
                <TableCell className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs font-medium">{i.title}</TableCell>
                <TableCell className="text-xs">{i.category}</TableCell>
                <TableCell><Badge variant={i.severity === "critical" ? "destructive" : "secondary"}>{i.severity}</Badge></TableCell>
                <TableCell className="text-xs">{i.status}</TableCell>
                <TableCell className="text-xs">{i.created_by_name}</TableCell>
                <TableCell>
                  <Select value={i.status} onValueChange={(v) => changeStatus(i.id, v)}>
                    <SelectTrigger className="h-7 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
            {!q.data?.incidents?.length && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No incidents.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
