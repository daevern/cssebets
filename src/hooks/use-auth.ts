import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "super_admin" | "viewer" | "member" | "pending";

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

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;
  const isViewer = roles.includes("viewer");
  const isAdminTier = isAdmin || isViewer;
  const isMember = roles.includes("member") || isAdmin;

  return {
    user,
    roles,
    loading,
    isAdmin,
    isSuperAdmin,
    isViewer,
    isAdminTier,
    isMember,
    isPending:
      roles.length === 0 ||
      (roles.includes("pending") && !isMember && !isAdminTier),
  };
}
