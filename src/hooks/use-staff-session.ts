import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks whether a Supabase session exists. Queries calling
 * requireSupabaseAuth server fns must NOT fire without one
 * (the middleware would throw "No authorization header").
 */
export function useHasSession() {
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
  return hasSession;
}

/** Re-check the session right before a server-fn call (guards polling refetches mid sign-out). */
export async function withSession<T>(fn: () => Promise<T>): Promise<T | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return fn();
}
