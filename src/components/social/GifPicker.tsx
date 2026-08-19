import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, X } from "lucide-react";
import { searchGifs, type GifResult } from "@/lib/gifs.functions";

export function GifPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (gif: GifResult) => void;
}) {
  const run = useServerFn(searchGifs);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 350);
    return () => clearTimeout(t);
  }, [term]);

  const { data, isFetching } = useQuery({
    queryKey: ["gif-search", debounced],
    queryFn: () => run({ data: { query: debounced || undefined, page: 1 } }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close GIF picker"
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        className="relative flex max-h-[78vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)] sm:rounded-3xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-surface-border)]/60 p-3">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white/[0.05] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--color-ink-muted)]" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search GIFs"
              autoFocus
              className="h-11 w-full bg-transparent text-base text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid h-11 w-11 place-items-center rounded-full text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-[220px] flex-1 overflow-y-auto p-3">
          {isFetching && !data ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-neon)]" />
            </div>
          ) : (data?.results.length ?? 0) === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-ink-muted)]">No GIFs found.</p>
          ) : (
            <div className="columns-2 gap-2 sm:columns-3">
              {data!.results.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    onSelect(g);
                    onOpenChange(false);
                  }}
                  className="mb-2 block w-full overflow-hidden rounded-xl border border-transparent hover:border-[var(--color-neon)]/60"
                >
                  <img
                    src={g.previewUrl}
                    alt={g.title}
                    loading="lazy"
                    className="w-full object-cover"
                    style={{ aspectRatio: `${g.width} / ${g.height}` }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="border-t border-[var(--color-surface-border)]/60 px-3 py-2 text-center text-[10px] text-[var(--color-ink-muted)]">
          GIFs powered by KLIPY
        </p>
      </div>
    </div>
  );
}
