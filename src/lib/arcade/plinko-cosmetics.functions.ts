import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyCosmetics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: catalog }, { data: owned }] = await Promise.all([
      supabase
        .from("arcade_cosmetics")
        .select("*")
        .eq("is_active", true)
        .order("cosmetic_type")
        .order("rarity"),
      supabase
        .from("arcade_user_cosmetics")
        .select("cosmetic_id, equipped, unlocked_at")
        .eq("user_id", userId),
    ]);
    const ownedMap = new Map((owned ?? []).map((o: any) => [o.cosmetic_id, o]));
    return (catalog ?? []).map((c: any) => {
      const o = ownedMap.get(c.id);
      // Free items are implicitly owned
      const isOwned = c.unlock_type === "free" || !!o;
      return { ...c, owned: isOwned, equipped: !!o?.equipped };
    });
  });

export const equipCosmetic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ cosmeticId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: cos, error: cerr } = await supabase
      .from("arcade_cosmetics")
      .select("id, cosmetic_type, unlock_type, is_active")
      .eq("id", data.cosmeticId)
      .single();
    if (cerr || !cos) throw new Error("Cosmetic not found");
    if (!cos.is_active) throw new Error("Cosmetic disabled");

    const { data: existing } = await supabase
      .from("arcade_user_cosmetics")
      .select("id, equipped")
      .eq("user_id", userId)
      .eq("cosmetic_id", data.cosmeticId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (!existing) {
      if (cos.unlock_type !== "free") throw new Error("Item not owned");
      // Unequip other of same type first (needed because of the unique partial index)
      await (supabaseAdmin as any)
        .from("arcade_user_cosmetics")
        .update({ equipped: false })
        .eq("user_id", userId)
        .eq("cosmetic_type", cos.cosmetic_type);
      const { error } = await (supabaseAdmin as any).from("arcade_user_cosmetics").insert({
        user_id: userId,
        cosmetic_id: cos.id,
        cosmetic_type: cos.cosmetic_type,
        equipped: true,
      });
      if (error) throw new Error(error.message);
    } else {
      await (supabaseAdmin as any)
        .from("arcade_user_cosmetics")
        .update({ equipped: false })
        .eq("user_id", userId)
        .eq("cosmetic_type", cos.cosmetic_type);
      const { error } = await (supabaseAdmin as any)
        .from("arcade_user_cosmetics")
        .update({ equipped: true })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const getEquippedCosmetics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("arcade_user_cosmetics")
      .select("cosmetic_type, arcade_cosmetics(id, code, name, preview_color, preview_accent)")
      .eq("user_id", userId)
      .eq("equipped", true);
    const out: { ball?: any; board?: any } = {};
    for (const r of (data ?? []) as any[]) {
      out[r.cosmetic_type as "ball" | "board"] = r.arcade_cosmetics;
    }
    return out;
  });

export const getActiveArcadeEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("arcade_events")
      .select("id, code, name, description, bonus_drops_per_day, starts_at, ends_at")
      .eq("is_active", true)
      .lte("starts_at", nowIso)
      .gte("ends_at", nowIso)
      .order("ends_at", { ascending: true });
    return data ?? [];
  });
