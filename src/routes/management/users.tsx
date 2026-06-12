import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { staffListUsers } from "@/lib/management.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/management/users")({
  head: () => ({ meta: [{ title: "Users — cssebets management" }] }),
  component: StaffUsersPage,
});

function StaffUsersPage() {
  const [search, setSearch] = useState("");

  // Don't call the server fn without a session (would 401 in auth middleware).
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const listFn = useServerFn(staffListUsers);
  const users = useQuery({
    queryKey: ["staff-users", search],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      return listFn({ data: { search } });
    },
    enabled: hasSession === true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Read-only directory for support. Use email or phone to contact a user.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-2 justify-between">
          <Input
            placeholder="Search by display name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="md:max-w-sm"
          />
          <span className="text-xs text-muted-foreground">
            {users.data?.users?.length ?? 0} users
          </span>
        </div>
        {users.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users.data?.users ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.display_name}</TableCell>
                    <TableCell className="text-xs select-all">
                      {u.email ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs select-all">
                      {u.phoneNumber ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.length
                        ? u.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {u.balance.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {u.suspended
                        ? <Badge variant="destructive">Suspended</Badge>
                        : <Badge variant="secondary">Active</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                {!users.data?.users?.length && !users.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No users found.
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
