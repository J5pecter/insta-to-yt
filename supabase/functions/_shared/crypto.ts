// AES-256-GCM encryption & HMAC-SHA256 state signing using Web Crypto API

function getMasterKeyBytes(): ArrayBuffer {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_MASTER_KEY") ?? "dev-fallback-master-key-change-in-prod-32b";
  const enc = new TextEncoder().encode(raw);
  const out = new Uint8Array(new ArrayBuffer(32));
  out.set(enc.slice(0, 32));
  return out.buffer;
}

async function importAesKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", getMasterKeyBytes(), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey();
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(cipherB64: string): Promise<string> {
  const raw = Uint8Array.from(atob(cipherB64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const data = raw.slice(12);
  const key = await importAesKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(plain);
}

export async function signOAuthState(payload: string): Promise<string> {
  const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? Deno.env.get("TOKEN_ENCRYPTION_MASTER_KEY") ?? "dev-state-secret";
  const ts = Math.floor(Date.now() / 1000).toString();
  const msg = `${payload}.${ts}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return btoa(`${msg}.${sigHex}`);
}

export async function verifyOAuthState(stateToken: string, maxAgeSeconds = 900): Promise<string | null> {
  try {
    const decoded = atob(stateToken);
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [payload, tsStr, sigHex] = parts;
    const ts = parseInt(tsStr, 10);
    if (Number.isNaN(ts) || Math.floor(Date.now() / 1000) - ts > maxAgeSeconds) return null;

    const secret = Deno.env.get("OAUTH_STATE_SECRET") ?? Deno.env.get("TOKEN_ENCRYPTION_MASTER_KEY") ?? "dev-state-secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)!.map((h) => parseInt(h, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(`${payload}.${tsStr}`));
    return valid ? payload : null;
  } catch {
    return null;
  }
}

export function maskSecret(value: string, prefix = 6, suffix = 4): string {
  if (!value) return "";
  if (value.length <= prefix + suffix) return "*".repeat(value.length);
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}
