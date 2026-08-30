import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { getClientIp, verifyTurnstile } from "../_shared/turnstile.ts";

const ALLOWED_HOSTNAMES = new Set(["macarthurjp.github.io", "mcp930.org", "www.mcp930.org"]);
const EXPECTED_ACTION = "join";

async function invokeSiblingFunction(name: string, body: unknown) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return;

  try {
    await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`No se pudo invocar ${name}`, error);
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
      console.warn("Turnstile verification failed for submit-join", turnstileResult);
      return jsonResponse({ ok: false, error: "Verificación de seguridad fallida." }, 403);
    }

    const nombre = String(payload.nombre || "").trim();
    const apellido = String(payload.apellido || "").trim();
    const email = String(payload.email || "").trim();

    if (!nombre || !apellido || !email) {
      return jsonResponse({ ok: false, error: "Faltan campos obligatorios." }, 400);
    }

    const record = {
      id: payload.id,
      nombre,
      apellido,
      email,
      telefono: payload.telefono || null,
      fecha_nacimiento: payload.fecha_nacimiento || null,
      estatus_matrimonial: payload.estatus_matrimonial || null,
      pais_nacimiento: payload.pais_nacimiento || null,
      pais_residencia: payload.pais_residencia || null,
      cristiana: payload.cristiana || null,
      comunidad: payload.comunidad || null,
      comments: payload.comments || null,
      hijos: payload.hijos ? Number(payload.hijos) : 0,
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Falta configuración de Supabase en la función.");
    }

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/unirse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(record),
    });

    if (!insertResponse.ok) {
      const text = await insertResponse.text();

      if (insertResponse.status === 409 || text.includes("23505")) {
        return jsonResponse({ ok: false, error: "duplicate", code: "23505" }, 409);
      }

      console.error("Error insertando en unirse", insertResponse.status, text);
      return jsonResponse({ ok: false, error: "No se pudo guardar el registro." }, 500);
    }

    const emailPayload = {
      nombre,
      apellido,
      email,
      telefono: payload.telefono || "",
      fecha_nacimiento: payload.fecha_nacimiento || "",
      estatus_matrimonial: payload.estatus_matrimonial || "",
      pais_nacimiento: payload.pais_nacimiento || "",
      pais_residencia: payload.pais_residencia || "",
      cristiana: payload.cristiana || "",
      comunidad: payload.comunidad || "",
      comments: payload.comments || "",
      hijos: payload.hijos || "0",
    };

    await Promise.allSettled([
      invokeSiblingFunction("send-welcome-email", emailPayload),
      invokeSiblingFunction("send-admin-notification", emailPayload),
      invokeSiblingFunction("send-birthday-emails", { memberId: payload.id }),
    ]);

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
