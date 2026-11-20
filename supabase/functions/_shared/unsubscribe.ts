// Signed, per-person unsubscribe links for notice emails. The signature is an
// HMAC of the email, so a link cannot be forged for someone else's address.
const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function encodeEmail(email: string) {
  return b64url(enc.encode(email.trim().toLowerCase()));
}
export function decodeEmail(value: string) {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder().decode(Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0)));
}

async function key() {
  const secret = `${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}|email-unsubscribe`;
  return await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function signEmail(email: string) {
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(email.trim().toLowerCase()));
  return b64url(new Uint8Array(sig));
}
export async function verifyEmailSignature(email: string, signature: string) {
  return (await signEmail(email)) === signature;
}

/** Page on the website (asks for confirmation) and one-click endpoint (mail apps). */
export async function unsubscribeLinks(email: string) {
  const query = `e=${encodeEmail(email)}&s=${await signEmail(email)}`;
  return {
    page: `https://mcp930.org/baja.html?${query}`,
    oneClick: `${Deno.env.get("SUPABASE_URL")}/functions/v1/email-unsubscribe?${query}`,
  };
}
