/** Client-safe helpers for member profile pictures. */

/**
 * Build the public image URL for a member's avatar.
 * `storagePath` is the value stored in profiles.avatar_url (e.g. "<uid>/avatar-1712345678.jpg").
 * Returns null when the member has no photo set.
 */
export function avatarSrc(userId: string | null | undefined, storagePath: string | null | undefined) {
  if (!userId || !storagePath) return null;
  const version = storagePath.replace(/\D/g, "").slice(-10) || "1";
  return `/api/public/avatar/${userId}?v=${version}`;
}

export function initialOf(name: string | null | undefined) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

/** Crop + downscale an image file to a square JPEG data blob for upload. */
export async function cropToSquareJpeg(
  image: HTMLImageElement,
  opts: { zoom: number; offsetX: number; offsetY: number; viewport: number; size?: number },
): Promise<Blob> {
  const size = opts.size ?? 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unsupported");

  const base = Math.min(image.naturalWidth, image.naturalHeight);
  // Scale factor mapping viewport pixels -> source pixels
  const drawn = base * opts.zoom;
  const scale = size / (opts.viewport / (drawn / opts.viewport) || 1);
  void scale;

  const sourceSize = base / opts.zoom;
  const maxOffsetX = (image.naturalWidth - sourceSize) / 2;
  const maxOffsetY = (image.naturalHeight - sourceSize) / 2;
  const ratio = sourceSize / opts.viewport;
  const sx = clamp(
    (image.naturalWidth - sourceSize) / 2 - opts.offsetX * ratio,
    0,
    Math.max(0, image.naturalWidth - sourceSize),
  );
  const sy = clamp(
    (image.naturalHeight - sourceSize) / 2 - opts.offsetY * ratio,
    0,
    Math.max(0, image.naturalHeight - sourceSize),
  );
  void maxOffsetX;
  void maxOffsetY;

  ctx.fillStyle = "#0b0f0d";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not process that image"))),
      "image/jpeg",
      0.86,
    ),
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
