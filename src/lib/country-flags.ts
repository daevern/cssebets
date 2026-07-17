// Map country/team names to ISO 3166-1 alpha-2 codes, then to emoji flags.
const NAME_TO_ISO2: Record<string, string> = {
  argentina: "AR", australia: "AU", austria: "AT", belgium: "BE", brazil: "BR",
  cameroon: "CM", canada: "CA", chile: "CL", china: "CN", colombia: "CO",
  "costa rica": "CR", croatia: "HR", "czech republic": "CZ", czechia: "CZ",
  denmark: "DK", ecuador: "EC", egypt: "EG", england: "GB-ENG", france: "FR",
  germany: "DE", ghana: "GH", greece: "GR", honduras: "HN", iceland: "IS",
  iran: "IR", "ir iran": "IR", iraq: "IQ", ireland: "IE", israel: "IL",
  italy: "IT", "ivory coast": "CI", "cote d'ivoire": "CI", japan: "JP",
  jordan: "JO", "korea republic": "KR", "south korea": "KR",
  "korea dpr": "KP", "north korea": "KP", mexico: "MX", morocco: "MA",
  netherlands: "NL", "new zealand": "NZ", nigeria: "NG", "northern ireland": "GB-NIR",
  norway: "NO", panama: "PA", paraguay: "PY", peru: "PE", poland: "PL",
  portugal: "PT", qatar: "QA", romania: "RO", russia: "RU", "saudi arabia": "SA",
  scotland: "GB-SCT", senegal: "SN", serbia: "RS", slovakia: "SK", slovenia: "SI",
  "south africa": "ZA", spain: "ES", sweden: "SE", switzerland: "CH",
  tunisia: "TN", turkey: "TR", türkiye: "TR", ukraine: "UA",
  "united states": "US", usa: "US", uruguay: "UY", venezuela: "VE", wales: "GB-WLS",
  algeria: "DZ", "bosnia and herzegovina": "BA", "bosnia-herzegovina": "BA",
  bulgaria: "BG", finland: "FI", hungary: "HU", india: "IN", indonesia: "ID",
  jamaica: "JM", kazakhstan: "KZ", kosovo: "XK", lebanon: "LB", libya: "LY",
  malaysia: "MY", mali: "ML", "new caledonia": "NC", "north macedonia": "MK",
  oman: "OM", philippines: "PH", "puerto rico": "PR", singapore: "SG",
  syria: "SY", thailand: "TH", "united arab emirates": "AE", uae: "AE",
  uzbekistan: "UZ", vietnam: "VN", "cape verde": "CV", "cabo verde": "CV",
  "curacao": "CW", "haiti": "HT", "el salvador": "SV", guatemala: "GT",
  "trinidad and tobago": "TT", bolivia: "BO",
  // F1-specific race hosts / labels
  bahrain: "BH", monaco: "MC", azerbaijan: "AZ", "abu dhabi": "AE",
  "great britain": "GB", "united kingdom": "GB", uk: "GB",
  "emilia romagna": "IT", miami: "US", "las vegas": "US",
};

const SUBDIVISION_FLAGS: Record<string, string> = {
  "GB-ENG": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "GB-SCT": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "GB-WLS": "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  "GB-NIR": "🇬🇧",
};

function iso2ToFlag(code: string): string {
  if (SUBDIVISION_FLAGS[code]) return SUBDIVISION_FLAGS[code];
  if (code.length !== 2) return "";
  const A = 0x1f1e6;
  const base = "A".charCodeAt(0);
  return String.fromCodePoint(A + code.charCodeAt(0) - base) +
         String.fromCodePoint(A + code.charCodeAt(1) - base);
}

export function teamFlagCode(name: string): string | null {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  const iso = NAME_TO_ISO2[key];
  if (!iso) return null;
  return iso.toLowerCase();
}

export function teamFlagUrl(name: string, width: 40 | 80 | 160 | 320 = 80): string | null {
  const code = teamFlagCode(name);
  if (!code) return null;
  // flagcdn.com serves PNG flags for ISO 3166-1 alpha-2 codes.
  // GB subdivisions (eng/sct/wls) are also supported as "gb-eng" etc.
  return `https://flagcdn.com/w${width}/${code}.png`;
}

