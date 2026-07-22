import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";

export function GuestAuthPrompt({
  open,
  onClose,
  title = "Create a free account to bet",
  subtitle = "Sign up in 10 seconds to place this bet and unlock your wallet, picks, and rewards.",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-6 text-[var(--ink)] shadow-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-[var(--ink-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-4 h-1 w-10 rounded-full bg-[var(--neon)]" />
        <h3 className="text-lg font-bold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{subtitle}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Link
            to="/register"
            className="rounded-xl bg-[var(--neon)] px-4 py-3 text-center text-sm font-bold text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
          >
            Create free account
          </Link>
          <Link
            to="/auth"
            className="rounded-xl border border-[var(--color-surface-border)] px-4 py-3 text-center text-sm font-semibold text-[var(--ink)] hover:border-[var(--neon)]/50 hover:text-[var(--neon)]"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}
