import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "member" | "pending";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        // Defer to avoid deadlock
        setTimeout(() => loadRoles(session.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setUser(data.session?.user ?? null);
      if (data.session?.user) await loadRoles(data.session.user.id);
      setLoading(false);
    })();

    async function loadRoles(uid: string) {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      if (!active) return;
      setRoles((data ?? []).map((r) => r.role as AppRole));
      setLoading(false);
    }

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return {
    user,
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isMember: roles.includes("member") || roles.includes("admin"),
    isPending: roles.length === 0 || (roles.includes("pending") && !roles.includes("member") && !roles.includes("admin")),
  };
}
