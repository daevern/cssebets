import { Volume2, VolumeX } from "lucide-react";
import { useArcadeSound } from "@/lib/arcade/sound";
import { cn } from "@/lib/utils";

/** Speaker toggle shared by every arcade game. */
export function ArcadeSoundToggle({ className }: { className?: string }) {
  const { muted, toggleMuted, play } = useArcadeSound();
  return (
    <button
      type="button"
      aria-label={muted ? "Unmute arcade sound" : "Mute arcade sound"}
      title={muted ? "Sound off" : "Sound on"}
      aria-pressed={!muted}
      onClick={() => {
        const next = !muted;
        toggleMuted();
        if (!next) play("button");
      }}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full border border-[var(--color-surface-border)] bg-black/55 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]",
        !muted && "text-[var(--color-neon)]",
        className,
      )}
    >
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
    </button>
  );
}
