// Client-side referral code capture (first-touch attribution).
const STORAGE_KEY = "csse_ref_code";
const CODE_RE = /^[A-Z0-9]{4,12}$/;

export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("ref");
    if (!raw) return;
    const code = raw.trim().toUpperCase();
    if (!CODE_RE.test(code)) return;
    if (window.localStorage.getItem(STORAGE_KEY)) return; // first-touch only
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // no-op
  }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
