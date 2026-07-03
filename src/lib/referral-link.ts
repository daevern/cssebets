export const REFERRAL_BASE_URL = "https://cssebets.com";

export function buildReferralLink(code: string | null | undefined): string {
  if (!code) return "";
  return `${REFERRAL_BASE_URL}/?ref=${encodeURIComponent(code)}`;
}
