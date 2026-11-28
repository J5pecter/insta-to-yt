// SSRF and Instagram URL normalization guard

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
];

export function assertSafePublicUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL format.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http/https URLs are permitted.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_IP_PATTERNS.some((re) => re.test(host))) {
    throw new Error("SSRF blocked: private or loopback hostnames are forbidden.");
  }
  return parsed;
}

export function parseInstagramUrl(rawUrl: string): { normalizedUrl: string; shortcode: string } {
  const parsed = assertSafePublicUrl(rawUrl);
  const host = parsed.hostname.toLowerCase();
  if (host !== "instagram.com" && host !== "www.instagram.com" && host !== "m.instagram.com") {
    throw new Error("URL must belong to instagram.com.");
  }
  const match = parsed.pathname.match(/\/(?:[A-Za-z0-9._]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,32})/i);
  if (!match) {
    throw new Error("Unsupported Instagram URL format. Expected a /reel/, /p/, or /tv/ link.");
  }
  const kind = match[1].toLowerCase() === "reels" ? "reel" : match[1].toLowerCase();
  const shortcode = match[2];
  return {
    normalizedUrl: `https://www.instagram.com/${kind}/${shortcode}/`,
    shortcode,
  };
}
