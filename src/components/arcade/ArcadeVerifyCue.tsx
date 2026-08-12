import { ShieldCheck } from "lucide-react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import { cn } from "@/lib/utils";

/**
 * On-table verify ritual — same language on every CSSE Original.
 * Presentation only; opens the game's existing verify dialog.
 */
export function ArcadeVerifyCue({
  game,
  onClick,
  disabled,
  label = "Verify round",
  className,
}: {
  game: ArcadeGameKey;
  onClick?: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] transition-opacity disabled:opacity-40",
        className,
      )}
      style={{
        borderColor: t.hud.plaqueBorder,
        color: t.accent,
        background: t.hud.plaqueBg,
      }}
      title="Re-derive this round in your browser from the published seed fingerprint"
    >
      <ShieldCheck className="h-3 w-3" />
      {label}
    </button>
  );
}
