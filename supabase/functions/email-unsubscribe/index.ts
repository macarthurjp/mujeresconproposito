// Unsubscribe from notice emails. Public (signed links, no session):
// - POST from the confirmation page (mcp930.org/baja.html) with JSON { e, s };
// - POST "List-Unsubscribe=One-Click" from mail apps (Gmail, Outlook…), with e/s in the URL.
// GET never unsubscribes, so link scanners cannot do it by accident.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { decodeEmail, verifyEmailSignature } from "../_shared/unsubscribe.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Usa el enlace del correo." }, 405);
  try {
    const url = new URL(req.url);
    const body = (req.headers.get("content-type") || "").includes("application/json") ? await req.json().catch(() => ({})) : {};
    const e = String(body.e || url.searchParams.get("e") || "");
    const s = String(body.s || url.searchParams.get("s") || "");
    let email = "";
    try { email = decodeEmail(e).trim().toLowerCase(); } catch { /* invalid */ }
    if (!email.includes("@") || !s || !(await verifyEmailSignature(email, s))) return json({ ok: false, error: "Enlace no válido." }, 400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.from("email_unsubscribes").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: "No se pudo completar la baja. Inténtalo de nuevo." }, 500);
  }
});
