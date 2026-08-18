import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True only when a live Supabase access token exists in the browser.
 * Server functions guarded by `requireSupabaseAuth` must not be called
 * before this is true, otherwise the RPC 500s with
 * "Unauthorized: No authorization header provided".
 */
export function useHasAccessToken() {
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (active) setHasToken(!!session?.access_token);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasToken(!!data.session?.access_token);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return hasToken;
}
