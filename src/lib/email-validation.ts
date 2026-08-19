// Shared email validation for auth flows: enforces a real, deliverable-looking
// address and blocks throwaway/disposable inbox providers.

const EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "fakeinbox.com",
  "trashmail.com",
  "dispostable.com",
  "getnada.com",
  "maildrop.cc",
  "mintemail.com",
  "moakt.com",
  "emailondeck.com",
  "spamgourmet.com",
  "mailnesia.com",
  "tempinbox.com",
  "burnermail.io",
  "inboxbear.com",
  "mail-temp.com",
  "tmpmail.org",
]);

/** Domains we never allow because they are internal/synthetic or non-routable. */
const BLOCKED_SUFFIXES = [".local", ".test", ".invalid", ".example", ".localhost"];

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Returns an error message when the address is not acceptable, otherwise null.
 */
/**
 * Sign-in validation: format only. Existing accounts (including internal
 * addresses like *.local) must not be blocked at login — whether the account
 * exists is decided by the auth server.
 */
export function validateLoginEmail(input: string): string | null {
  const email = normalizeEmail(input);
  if (!email) return "Please enter your email address";
  if (email.length > 254) return "That email address is too long";
  if (!EMAIL_RE.test(email)) return "Please enter a valid email address";
  return null;
}

export function validateRealEmail(input: string): string | null {
  const email = normalizeEmail(input);
  if (!email) return "Please enter your email address";
  if (email.length > 254) return "That email address is too long";
  if (!EMAIL_RE.test(email)) return "Please enter a valid email address";

  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (domain.includes("..") || domain.startsWith("-") || domain.endsWith("-")) {
    return "Please enter a valid email address";
  }
  if (BLOCKED_SUFFIXES.some((suffix) => domain.endsWith(suffix))) {
    return "Please use a real, working email address";
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return "Temporary or disposable email addresses aren't allowed";
  }
  return null;
}
