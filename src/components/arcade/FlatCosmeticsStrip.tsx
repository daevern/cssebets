import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  equipCosmetic,
  getMyCosmetics,
} from "@/lib/arcade/plinko-cosmetics.functions";
import { cn } from "@/lib/utils";

/**
 * Flat 2D Plinko skins — solid color swatches only (ball fill / board fill).
 * Presentation; unlock rules stay on the server.
 */
export function FlatCosmeticsStrip({ disabled }: { disabled?: boolean }) {
  const qc = useQueryClient();
  const listFn = useServerFn(getMyCosmetics);
  const equipFn = useServerFn(equipCosmetic);
  const q = useQuery({
    queryKey: ["plinko-cosmetics"],
    queryFn: () => listFn({}),
    staleTime: 60_000,
  });

  const equip = useMutation({
    mutationFn: (cosmeticId: string) => equipFn({ data: { cosmeticId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["plinko-cosmetics"] }),
        qc.invalidateQueries({ queryKey: ["plinko-equipped"] }),
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (q.data ?? []).filter(
    (c: any) => c.owned && (c.cosmetic_type === "ball" || c.cosmetic_type === "board"),
  );
  if (!items.length) return null;

  const balls = items.filter((c: any) => c.cosmetic_type === "ball");
  const boards = items.filter((c: any) => c.cosmetic_type === "board");

  return (
    <div className="flex flex-col gap-1.5">
      {balls.length > 0 && (
        <Row
          label="Ball"
          items={balls}
          disabled={disabled || equip.isPending}
          onPick={(id) => equip.mutate(id)}
        />
      )}
      {boards.length > 0 && (
        <Row
          label="Board"
          items={boards}
          disabled={disabled || equip.isPending}
          onPick={(id) => equip.mutate(id)}
        />
      )}
    </div>
  );
}

function Row({
  label,
  items,
  disabled,
  onPick,
}: {
  label: string;
  items: any[];
  disabled?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.name}
          disabled={disabled}
          onClick={() => onPick(c.id)}
          className={cn(
            "h-7 w-7 shrink-0 rounded-full border transition-opacity disabled:opacity-40",
            c.equipped ? "opacity-100" : "opacity-70 hover:opacity-100",
          )}
          style={{
            background: c.preview_color ?? "#888",
            borderColor: c.equipped
              ? (c.preview_accent ?? "#fff")
              : "rgba(255,255,255,.2)",
            boxShadow: c.equipped
              ? `0 0 0 2px ${c.preview_accent ?? "#8f9bff"}`
              : undefined,
          }}
          aria-pressed={!!c.equipped}
          aria-label={`Equip ${c.name}`}
        />
      ))}
    </div>
  );
}
