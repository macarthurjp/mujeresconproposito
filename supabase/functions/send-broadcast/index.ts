// Push message from the admin panel to every device, or to one community.
// Needs notices.send (notices.view for dryRun). Body: { titulo, mensaje, comunidad?, porCorreo?, dryRun? }
// porCorreo also emails everyone registered through Únete (that community, or all),
// except people who unsubscribed.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendEmail } from "../_shared/email.ts";
import { esc, paragraph, renderEmail } from "../_shared/email-layout.ts";
import { sendExpoPush } from "../_shared/expo-push.ts";
import { unsubscribeLinks } from "../_shared/unsubscribe.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const COMMUNITIES = ["Europa", "Estados Unidos", "República Dominicana"];

// IANA time zones of the United States (incl. Hawaii, Alaska and Puerto Rico).
const US_ZONES = /^(US\/|America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Juneau|Sitka|Yakutat|Nome|Metlakatla|Adak|Boise|Detroit|Indiana\/|Kentucky\/|North_Dakota\/|Menominee|Puerto_Rico)|Pacific\/Honolulu)/;

function communityFromTimeZone(tz?: string | null): string | null {
  const zone = String(tz || "");
  if (zone === "America/Santo_Domingo") return "República Dominicana";
  if (/^Europe\//.test(zone) || /^Atlantic\/(Canary|Madeira|Azores)$/.test(zone)) return "Europa";
  if (US_ZONES.test(zone)) return "Estados Unidos";
  return null;
}

type Person = { email: string; nombre: string };

/** Registered people (Únete) of a community, or all; one per email; minus unsubscribed. */
// deno-lint-ignore no-explicit-any
async function emailRecipients(admin: any, comunidad: string | null): Promise<Person[]> {
  let query = admin.from("unirse").select("email,nombre,comunidad");
  if (comunidad) query = query.eq("comunidad", comunidad);
  const [{ data: rows, error }, { data: optedOut, error: optError }] = await Promise.all([
    query, admin.from("email_unsubscribes").select("email"),
  ]);
  if (error) throw error;
  if (optError) throw optError;
  const skip = new Set((optedOut ?? []).map((r: { email: string }) => r.email));
  const people = new Map<string, Person>();
  for (const r of rows ?? []) {
    const email = String(r.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || skip.has(email) || people.has(email)) continue;
    people.set(email, { email, nombre: String(r.nombre || "").trim().split(/\s+/)[0] || "" });
  }
  return [...people.values()];
}

/** The notice as a branded email, one per person (each with its own unsubscribe link). */
async function sendNoticeEmails(people: Person[], titulo: string, mensaje: string, comunidad: string | null) {
  let delivered = 0;
  const queue = [...people];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const links = await unsubscribeLinks(p.email);
        const greeting = p.nombre ? `Hola, ${p.nombre}:` : "Hola:";
        await sendEmail({
          to: p.email,
          subject: titulo,
          text: [greeting, "", mensaje, "", "Mujeres con Propósito", "https://mcp930.org", "", `Para dejar de recibir estos avisos por correo: ${links.page}`].join("\n"),
          headers: { "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          html: renderEmail({
            preheader: mensaje.slice(0, 120),
            eyebrow: comunidad ? `Aviso · ${comunidad}` : "Aviso de la comunidad",
            title: titulo,
            body: paragraph(esc(greeting)) + paragraph(esc(mensaje).replace(/\n/g, "<br>")),
            actions: [{ label: "Visitar la comunidad", url: "https://mcp930.org" }],
            footnote: `Recibes este correo porque te registraste en Mujeres con Propósito. <a href="${esc(links.page)}" style="color:#a64b43;">Dejar de recibir avisos por correo</a>.`,
          }),
        });
        delivered += 1;
      } catch (error) {
        console.error("notice email failed", p.email.replace(/^(.).*@/, "$1***@"), error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));
  return delivered;
}

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

    const { data: devices, error } = await admin.from("push_tokens").select("token,comunidad,zona_horaria").eq("activo", true);
    if (error) throw error;
    // A device belongs to the community chosen in the app; if none was chosen,
    // it is inferred from the phone's time zone (most people never pick one).
    const tokens = (devices ?? [])
      .filter((d) => !comunidad || (d.comunidad ? d.comunidad === comunidad : communityFromTimeZone(d.zona_horaria) === comunidad))
      .map((d) => d.token as string);
    const people = await emailRecipients(admin, comunidad);
    if (body.dryRun) return json({ ok: true, dryRun: true, destinatarios: tokens.length, correos: people.length });

    const { sent, dead } = tokens.length
      ? await sendExpoPush(tokens.map((to) => ({ to, title: titulo, body: mensaje, data: { type: "broadcast" } })))
      : { sent: 0, dead: [] as string[] };
    if (dead.length) await admin.from("push_tokens").update({ activo: false }).in("token", dead);
    const correos = body.porCorreo ? await sendNoticeEmails(people, titulo, mensaje, comunidad) : 0;
    await admin.from("push_broadcasts").insert({ titulo, mensaje, comunidad, enviados: sent, correos, enviado_por: user.id });
    return json({ ok: true, enviados: sent, destinatarios: tokens.length, correos });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
