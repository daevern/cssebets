import { useEffect, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { usePushSubscription } from "@/hooks/use-push-subscription";

const DISMISS_KEY = "csse:install-prompt:dismissed_at";
const DISMISS_DAYS = 30;

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true;
}

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [iosStep, setIosStep] = useState(false);
  const [deferred, setDeferred] = useState<any>(null);
  const { status, enable } = usePushSubscription();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // Show iOS instructions after a small delay if there's no BIP event
    const t = setTimeout(() => {
      if (isIOS() && !isStandalone()) setVisible(true);
    }, 1500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      clearTimeout(t);
    };
  }, []);

  // Once standalone, auto-request permission if not already handled
  useEffect(() => {
    if (isStandalone() && status === "default") {
      // Show the card just as a "Enable notifications" invite
      setVisible(true);
    }
  }, [status]);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      if (outcome === "accepted") {
        // Permission prompt happens after install/launch as standalone.
        setVisible(false);
        return;
      }
      dismiss();
      return;
    }
    if (isIOS()) { setIosStep(true); return; }
    // Already installed or unsupported → try to enable notifications directly
    await enable();
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:px-4 sm:pb-4">
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--color-surface-border)] bg-[#0b1220]/95 backdrop-blur p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-neon)]/15 text-[var(--color-neon)]">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-white">Never miss an update</div>
            <p className="mt-1 text-[12px] leading-relaxed text-white/70">
              Install CSSEBets on your phone and enable notifications to get instant updates for:
              account approval, top-up requests, cashout updates, and support replies.
            </p>

            {iosStep && (
              <ol className="mt-3 space-y-1 rounded-lg bg-white/5 p-3 text-[12px] text-white/80">
                <li>1. Tap the <b>Share</b> button in Safari.</li>
                <li>2. Choose <b>Add to Home Screen</b>.</li>
                <li>3. Open CSSEBets from your home screen and allow notifications.</li>
              </ol>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isStandalone() && (status === "granted-unsubscribed" || status === "default") ? (
                <button
                  onClick={async () => { await enable(); dismiss(); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-neon)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black hover:brightness-110"
                >
                  <Bell className="h-3.5 w-3.5" /> Enable notifications
                </button>
              ) : (
                <button
                  onClick={install}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-neon)] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-black hover:brightness-110"
                >
                  <Download className="h-3.5 w-3.5" /> Install CSSEBets
                </button>
              )}
              <button
                onClick={dismiss}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 hover:bg-white/10"
              >
                Not Now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="ml-auto -mr-1 -mt-1 rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
