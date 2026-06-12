// Browser screenshots/screen recordings cannot be reliably blocked on web.
// This module provides deterrence via watermarking, blur-on-background,
// print suppression, and context-menu / drag restrictions.

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";

type Props = {
  displayName: string;
  uid: string;
};

/**
 * Mount once inside the authenticated layout. Renders:
 *  - a diagonal repeating watermark over the whole viewport
 *  - a blur + warning overlay whenever the tab/window loses focus
 *  - global print suppression
 *  - context-menu + image-drag suppression scoped to the authed app
 */
export function ScreenProtection({ displayName, uid }: Props) {
  const [hidden, setHidden] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Refresh watermark timestamp each minute so a leaked screenshot is dated.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Blur when tab/window loses focus.
  useEffect(() => {
    function onBlur() { setHidden(true); }
    function onFocus() { setHidden(false); }
    function onVisibility() {
      setHidden(document.visibilityState !== "visible");
    }
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Suppress context menu + image drag globally while authed layout is mounted.
  useEffect(() => {
    function onContext(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      // Allow context menu inside form inputs / textareas so users can paste.
      if (t && t.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    }
    function onDragStart(e: DragEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "IMG" || t.closest("img, [data-no-drag]"))) {
        e.preventDefault();
      }
    }
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("dragstart", onDragStart);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("dragstart", onDragStart);
    };
  }, []);

  const shortUid = uid ? `${uid.slice(0, 8)}…${uid.slice(-4)}` : "anon";
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const tile = `${displayName || "user"} · ${shortUid} · ${stamp}`;

  return (
    <>
      {/* Global print suppression */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          body::after {
            content: "Printing is disabled for security.";
            visibility: visible !important;
            position: fixed; inset: 0;
            display: flex; align-items: center; justify-content: center;
            font: 600 18px system-ui, sans-serif;
            color: #000; background: #fff;
          }
        }
      `}</style>

      {/* Watermark — diagonal repeating tiles, pointer-events none */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] select-none overflow-hidden"
        style={{ mixBlendMode: "overlay" }}
      >
        <div
          className="absolute -inset-[20%] flex flex-wrap gap-x-16 gap-y-24"
          style={{ transform: "rotate(-22deg)", opacity: 0.12 }}
        >
          {Array.from({ length: 240 }).map((_, i) => (
            <span
              key={i}
              className="whitespace-nowrap font-mono text-[11px] font-semibold tracking-wide text-foreground"
            >
              {tile}
            </span>
          ))}
        </div>
      </div>

      {/* Blur overlay on focus loss */}
      {hidden && (
        <div
          aria-hidden
          className="fixed inset-0 z-[70] grid place-items-center bg-background/70 backdrop-blur-xl"
        >
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <ShieldAlert className="h-10 w-10 text-primary" />
            <div className="text-base font-semibold">Screen protected</div>
            <div className="text-sm text-muted-foreground max-w-xs">
              Return to the app to continue. Screenshots and recordings are
              discouraged — your session is watermarked.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
