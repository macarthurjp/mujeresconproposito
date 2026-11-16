// Push message from the admin panel to every device, or to one community.
// Only Super Admins (checked server-side). Body: { titulo, mensaje, comunidad? , dryRun? }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendExpoPush } from "../_shared/expo-push.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const COMMUNITIES = ["Europa", "Estados Unidos", "República Dominicana"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ ok: false, error: "Sesión requerida." }, 401);
    const body = await req.json().catch(() => ({}));
    const titulo = String(body.titulo || "").trim().slice(0, 80);
    const mensaje = String(body.mensaje || "").trim().slice(0, 240);
    const comunidad = body.comunidad ? String(body.comunidad) : null;
    if (!titulo || !mensaje) return json({ ok: false, error: "Escribe un título y un mensaje." }, 400);
    if (comunidad && !COMMUNITIES.includes(comunidad)) return json({ ok: false, error: "Comunidad inválida." }, 400);
    const requiredAction = body.dryRun ? "view" : "send";
    const { data: allowed, error: permissionError } = await admin.rpc("admin_user_has_permission", { p_user_id: user.id, p_module: "notices", p_action: requiredAction });
    if (permissionError || allowed !== true) return json({ ok: false, error: body.dryRun ? "No tienes acceso a este módulo." : "No tienes permiso para enviar avisos." }, 403);

    let query = admin.from("push_tokens").select("token").eq("activo", true);
    if (comunidad) query = query.eq("comunidad", comunidad);
    const { data: devices, error } = await query;
    if (error) throw error;
    const tokens = (devices ?? []).map((d) => d.token as string);
    if (body.dryRun) return json({ ok: true, dryRun: true, destinatarios: tokens.length });

    const { sent, dead } = tokens.length
      ? await sendExpoPush(tokens.map((to) => ({ to, title: titulo, body: mensaje, data: { type: "broadcast" } })))
      : { sent: 0, dead: [] as string[] };
    if (dead.length) await admin.from("push_tokens").update({ activo: false }).in("token", dead);
    await admin.from("push_broadcasts").insert({ titulo, mensaje, comunidad, enviados: sent, enviado_por: user.id });
    return json({ ok: true, enviados: sent, destinatarios: tokens.length });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
