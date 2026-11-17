import { requiredEnv } from "./http.ts";

export type TurnstileResult = {
  success: boolean;
  action?: string;
  hostname?: string;
  errorCodes?: string[];
};

export async function verifyTurnstile(token: unknown, remoteip: string | null): Promise<TurnstileResult> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const secret = requiredEnv("TURNSTILE_SECRET");
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      return { success: false, errorCodes: [`siteverify-http-${response.status}`] };
    }

    const data = await response.json();
    return {
      success: data.success === true,
      action: data.action,
      hostname: data.hostname,
      errorCodes: data["error-codes"],
    };
  } catch (error) {
    console.error("Turnstile siteverify request failed", error);
    return { success: false, errorCodes: ["siteverify-network-error"] };
  }
}

export function getClientIp(req: Request): string | null {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip");
}

// ---------- Fallback token (app WebView, when Turnstile cannot complete) ----------
const FALLBACK_PREFIX = "mcpfb";
const FALLBACK_TTL_MS = 10 * 60 * 1000;

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(text: string) {
  const s = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`fallback:${requiredEnv("TURNSTILE_SECRET")}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}
export async function hashIp(ip: string | null) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ip:${ip || "unknown"}:${requiredEnv("TURNSTILE_SECRET")}`));
  return b64url(new Uint8Array(digest)).slice(0, 32);
}
export async function signFallbackToken(action: string, nonce: string) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ a: action, n: nonce, e: Date.now() + FALLBACK_TTL_MS })));
  return `${FALLBACK_PREFIX}.${payload}.${await hmac(payload)}`;
}

async function serviceRest(path: string, init: RequestInit) {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) } });
}

/** Accepts a real Turnstile token or a single-use fallback token issued by form-fallback-token. */
export async function verifyHumanToken(token: unknown, remoteip: string | null, expectedAction: string): Promise<TurnstileResult & { fallback?: boolean }> {
  if (typeof token === "string" && token.startsWith(`${FALLBACK_PREFIX}.`)) {
    const [, payload, signature] = token.split(".");
    if (!payload || !signature || signature !== await hmac(payload)) return { success: false, errorCodes: ["fallback-bad-signature"] };
    let data: { a?: string; n?: string; e?: number };
    try { data = JSON.parse(new TextDecoder().decode(fromB64url(payload))); } catch { return { success: false, errorCodes: ["fallback-bad-payload"] }; }
    if (data.a !== expectedAction || !data.n || !data.e || data.e < Date.now()) return { success: false, errorCodes: ["fallback-expired-or-wrong-action"] };
    // Single use: mark the nonce as used; fails if it was already used.
    const res = await serviceRest(`form_verification_fallbacks?nonce=eq.${encodeURIComponent(data.n)}&used_at=is.null`, {
      method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ used_at: new Date().toISOString() }),
    });
    const rows = res.ok ? await res.json() : [];
    if (!Array.isArray(rows) || rows.length !== 1) return { success: false, errorCodes: ["fallback-already-used"] };
    return { success: true, action: expectedAction, hostname: "mcp930.org", fallback: true };
  }
  return verifyTurnstile(token, remoteip);
}
export { serviceRest };
