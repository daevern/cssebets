import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GifResult = {
  id: string;
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/klipy";

/** Only KLIPY-hosted media may be attached to a comment. */
export function isAllowedGifUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "klipy.com" || u.hostname.endsWith(".klipy.com"));
  } catch {
    return false;
  }
}

function pickFile(file: any, formats: string[]): any | null {
  if (!file || typeof file !== "object") return null;
  const sizeOrder = ["md", "sm", "xs", "hd", "400", "320", "240"];
  const keys = [...sizeOrder.filter((k) => file[k]), ...Object.keys(file).filter((k) => !sizeOrder.includes(k))];
  for (const key of keys) {
    const bucket = file[key];
    if (!bucket) continue;
    for (const fmt of formats) {
      const entry = bucket[fmt];
      if (entry?.url) return entry;
    }
  }
  return null;
}

export const searchGifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        query: z.string().trim().max(80).optional(),
        page: z.number().int().min(1).max(20).default(1),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ results: GifResult[]; hasNext: boolean }> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const klipyKey = process.env["KLIPY_API_KEY"];
    if (!lovableKey || !klipyKey) throw new Error("GIF search isn't configured yet.");

    const q = data.query?.trim();
    const params = new URLSearchParams({
      customer_id: context.userId,
      page: String(data.page),
      per_page: "24",
    });
    if (q) params.set("q", q);

    const res = await fetch(`${GATEWAY_URL}/gifs/${q ? "search" : "trending"}?${params}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": klipyKey,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`KLIPY request failed [${res.status}]: ${text}`);
      throw new Error("Couldn't load GIFs right now.");
    }
    const payload: any = await res.json();
    if (!payload?.result) {
      console.error(`KLIPY error body: ${JSON.stringify(payload)}`);
      throw new Error("Couldn't load GIFs right now.");
    }

    const items: any[] = payload.data?.data ?? [];
    const results: GifResult[] = [];
    for (const item of items) {
      const full = pickFile(item.file, ["gif", "webp"]);
      const preview = pickFile(item.file, ["webp", "gif"]);
      if (!full?.url || !isAllowedGifUrl(full.url)) continue;
      results.push({
        id: String(item.id ?? full.url),
        title: String(item.title ?? "GIF"),
        url: full.url,
        previewUrl: isAllowedGifUrl(preview?.url ?? "") ? preview.url : full.url,
        width: Number(full.width) || 220,
        height: Number(full.height) || 220,
      });
    }
    return { results, hasNext: !!payload.data?.has_next };
  });
