// Issues a single-use verification token for the app's forms when Cloudflare Turnstile
// cannot complete inside the app WebView (app-verify.html calls this after retrying).
// Rate-limited per IP and globally; stores the Turnstile error code for diagnosis.
import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { getClientIp, hashIp, serviceRest, signFallbackToken } from "../_shared/turnstile.ts";

const ALLOWED_ORIGINS = new Set(["https://mcp930.org", "https://www.mcp930.org"]);
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_HOUR = 80;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  try {
    if (!ALLOWED_ORIGINS.has(req.headers.get("origin") || "")) return jsonResponse({ ok: false, error: "Origen no permitido." }, 403);
    const body = await req.json().catch(() => ({}));
    const action = body.action === "contact" ? "contact" : body.action === "join" ? "join" : null;
    if (!action) return jsonResponse({ ok: false, error: "Acción inválida." }, 400);
    const code = String(body.code ?? "").slice(0, 40) || null;
    const ipHash = await hashIp(getClientIp(req));
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const count = async (filter: string) => {
      const res = await serviceRest(`form_verification_fallbacks?select=id&created_at=gte.${since}${filter}`, { method: "HEAD", headers: { Prefer: "count=exact" } });
      return Number((res.headers.get("content-range") || "*/0").split("/")[1] || 0);
    };
    if (await count(`&ip_hash=eq.${ipHash}`) >= PER_IP_PER_HOUR || await count("") >= GLOBAL_PER_HOUR) {
      return jsonResponse({ ok: false, error: "Demasiados intentos. Inténtalo más tarde." }, 429);
    }

    const nonce = crypto.randomUUID();
    const insert = await serviceRest("form_verification_fallbacks", { method: "POST", body: JSON.stringify({ ip_hash: ipHash, action, error_code: code, nonce }) });
    if (!insert.ok) throw new Error(`insert ${insert.status}`);
    console.warn("Turnstile fallback issued", { action, code });
    return jsonResponse({ ok: true, token: await signFallbackToken(action, nonce) });
  } catch (error) {
    console.error("form-fallback-token failed", error);
    return jsonResponse({ ok: false, error: "No se pudo verificar." }, 500);
  }
});
