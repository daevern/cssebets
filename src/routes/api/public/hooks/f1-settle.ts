import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/f1-settle")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { runF1AutoSettle } = await import("@/features/f1/services/f1Settlement.server");
          const r = await runF1AutoSettle();
          return new Response(JSON.stringify(r), { headers: { "content-type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
