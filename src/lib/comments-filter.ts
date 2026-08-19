const BANNED = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "bastard",
  "wanker",
  "nigger",
  "faggot",
  "retard",
  "whore",
  "slut",
];

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|co)\b)/i;

export type ScreenResult = { ok: true; body: string } | { ok: false; reason: string };

/** Basic profanity / spam screen for user comments. */
export function screenComment(raw: string): ScreenResult {
  const body = raw.trim().replace(/\s{3,}/g, "  ");
  if (!body) return { ok: false, reason: "Comment can't be empty." };
  if (body.length > 500) return { ok: false, reason: "Comments are limited to 500 characters." };
  if (LINK_RE.test(body)) return { ok: false, reason: "Links aren't allowed in comments." };

  const letters = body.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) {
    return { ok: false, reason: "Please don't shout — turn off caps lock." };
  }
  if (/(.)\1{7,}/.test(body)) return { ok: false, reason: "That looks like spam." };

  const normalised = body.toLowerCase().replace(/[^a-z\s]/g, "");
  const words = new Set(normalised.split(/\s+/));
  for (const bad of BANNED) {
    if (words.has(bad) || normalised.includes(bad)) {
      return { ok: false, reason: "Keep it civil — that word isn't allowed." };
    }
  }
  return { ok: true, body };
}
