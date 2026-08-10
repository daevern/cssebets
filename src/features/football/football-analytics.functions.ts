import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Club-football analytics bundle (same shape as the World Cup screen consumes).
export const getFootballEventAnalytics = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { fetchFootballEventAnalytics } = await import(
      "./services/footballAnalytics.server"
    );
    return fetchFootballEventAnalytics(data.matchId);
  });
