import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True only when a live Supabase access token exists in the browser.
 * Server functions guarded by `requireSupabaseAuth` must not be called
 * before this is true, otherwise the RPC 500s with
 * "Unauthorized: No authorization header provided".
 */
export function useAccessToken() {
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setAccessToken(session?.access_token ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active) setAccessToken(data.session?.access_token ?? null);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return accessToken;
}

export function useHasAccessToken() {
  return useAccessToken() !== null;
}
