import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { getClientIp, verifyTurnstile } from "../_shared/turnstile.ts";

const ALLOWED_HOSTNAMES = new Set(["macarthurjp.github.io", "mcp930.org", "www.mcp930.org"]);
const EXPECTED_ACTION = "contact";

async function invokeSiblingFunction(name: string, body: unknown) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return false;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error(`${name} respondió con estado ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`No se pudo invocar ${name}`, error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const payload = await req.json();
    const turnstileResult = await verifyTurnstile(payload.turnstileToken, getClientIp(req));

    if (
      !turnstileResult.success ||
      turnstileResult.action !== EXPECTED_ACTION ||
      !turnstileResult.hostname ||
      !ALLOWED_HOSTNAMES.has(turnstileResult.hostname)
    ) {
      console.warn("Turnstile verification failed for submit-contact", turnstileResult);
      return jsonResponse({ ok: false, error: "Verificación de seguridad fallida." }, 403);
    }

    const nombre = String(payload.nombre || "").trim();
    const email = String(payload.email || "").trim();
    const mensaje = String(payload.mensaje || "").trim();

    if (!nombre || !email || !mensaje) {
      return jsonResponse({ ok: false, error: "Faltan campos obligatorios." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Falta configuración de Supabase en la función.");
    }

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/contact_messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        nombre,
        email,
        mensaje,
        destino: payload.destino || null,
        source: "web",
      }),
    });

    if (!insertResponse.ok) {
      const text = await insertResponse.text();
      console.error("Error insertando en contact_messages", insertResponse.status, text);
      return jsonResponse({ ok: false, error: "No se pudo guardar el mensaje." }, 500);
    }

    const notificationSent = await invokeSiblingFunction("send-contact-email", {
      nombre,
      email,
      mensaje,
      destino: payload.destino || "",
    });

    return jsonResponse({ ok: true, notificationSent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
