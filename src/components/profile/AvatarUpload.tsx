import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { avatarSrc, cropToSquareJpeg, initialOf } from "@/lib/avatar";

const VIEWPORT = 260;
const MAX_BYTES = 8 * 1024 * 1024;

export function AvatarUpload({
  userId,
  displayName,
  avatarPath,
  onChanged,
  size = 72,
}: {
  userId: string;
  displayName: string;
  avatarPath: string | null;
  onChanged: () => void;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // object URL
  const [busy, setBusy] = useState(false);
  const src = avatarSrc(userId, avatarPath);

  function pick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file.");
    if (file.size > MAX_BYTES) return toast.error("That image is larger than 8 MB.");
    setEditing(URL.createObjectURL(file));
  }

  async function upload(blob: Blob) {
    setBusy(true);
    try {
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      const previous = avatarPath;
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
      if (error) throw error;
      if (previous && previous !== path) {
        await supabase.storage.from("avatars").remove([previous]).catch?.(() => {});
      }
      toast.success("Profile photo updated.");
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't upload that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setBusy(true);
    try {
      const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
      if (error) throw error;
      if (avatarPath) await supabase.storage.from("avatars").remove([avatarPath]);
      toast.success("Photo removed.");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative shrink-0 rounded-full"
          style={{ width: size, height: size }}
          aria-label="Change profile photo"
        >
          {src ? (
            <img src={src} alt={displayName} className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="grid h-full w-full place-items-center rounded-full bg-[var(--color-neon)]/15 text-2xl font-semibold text-[var(--color-neon)]">
              {initialOf(displayName)}
            </span>
          )}
          <span className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]">
            <Camera className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-[var(--color-ink)]">{displayName}</div>
          <div className="mt-1 flex items-center gap-3 text-[12px]">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="font-semibold text-[var(--color-neon)]"
            >
              {src ? "Change photo" : "Add photo"}
            </button>
            {src && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-red-400 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {editing && (
        <CropSheet
          url={editing}
          busy={busy}
          onCancel={() => {
            URL.revokeObjectURL(editing);
            setEditing(null);
          }}
          onConfirm={upload}
        />
      )}
    </>
  );
}

function CropSheet({
  url,
  busy,
  onCancel,
  onConfirm,
}: {
  url: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setLoaded(true);
    };
    img.src = url;
  }, [url]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!imgRef.current) return;
    const blob = await cropToSquareJpeg(imgRef.current, {
      zoom,
      offsetX: offset.x,
      offsetY: offset.y,
      viewport: VIEWPORT,
    });
    onConfirm(blob);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl border-t border-[var(--color-surface-border)] bg-[var(--color-surface)] p-5 sm:rounded-3xl sm:border">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">Adjust photo</h3>
          <button type="button" onClick={onCancel} className="text-[var(--color-ink-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="relative mx-auto touch-none overflow-hidden rounded-full bg-black"
          style={{ width: VIEWPORT, height: VIEWPORT }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {loaded && (
            <img
              src={url}
              alt="Preview"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                width: VIEWPORT,
                height: VIEWPORT,
                objectFit: "cover",
              }}
            />
          )}
        </div>

        <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          Zoom
        </label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="mt-2 w-full accent-[var(--color-neon)]"
        />

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-3 text-xs font-semibold text-[var(--color-ink-muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !loaded}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-neon)] px-5 py-3 text-xs font-bold text-black disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save photo
          </button>
        </div>
      </div>
    </div>
  );
}
