import { createFileRoute } from "@tanstack/react-router";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/avatar/$userId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const userId = String(params.userId ?? "");
        if (!UUID.test(userId)) return new Response("Not found", { status: 404 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: profile } = await (supabaseAdmin as any)
            .from("profiles")
            .select("avatar_url")
            .eq("id", userId)
            .maybeSingle();
          const path = profile?.avatar_url as string | null;
          if (!path || !path.startsWith(`${userId}/`)) {
            return new Response("Not found", { status: 404 });
          }
          const { data: file, error } = await (supabaseAdmin as any).storage
            .from("avatars")
            .download(path);
          if (error || !file) return new Response("Not found", { status: 404 });
          const buf = await file.arrayBuffer();
          return new Response(buf, {
            headers: {
              "content-type": "image/jpeg",
              // Cache-busted by the ?v= query the client appends.
              "cache-control": "public, max-age=86400, immutable",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
