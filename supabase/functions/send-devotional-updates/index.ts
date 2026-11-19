// Sends the queued "update about your devotional" emails to authors.
// Called every minute by pg_cron (job mcp930-devocional-updates-email) with
// the x-cron-secret header; only runs when the outbox has pending rows.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEVOTIONAL_CRON_SECRET,
// plus the email provider secrets used by _shared/email.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { formatDateEs, infoTable, messageBlock, renderEmail } from "../_shared/email-layout.ts";
import { sendEmail } from "../_shared/email.ts";
import { timingSafeEqual } from "../_shared/expo-push.ts";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";

const ADMIN_URL = "https://mcp930.org/admin.html";
const PUBLIC_URL = "https://mcp930.org/devocionales.html?articulo=";
const MAX_ATTEMPTS = 5;
const BATCH = 20;

type Row = {
  id: number;
  event_type: string;
  recipients: string[];
  attempts: number;
  payload: { titulo?: string; slug?: string; nota?: string; fecha?: string | null };
};

type Copy = { subject: string; title: string; intro: string; action?: { label: string; url: string }; showNote?: boolean };

function copyFor(row: Row): Copy | null {
  const t = (row.payload.titulo || "tu devocional").replace(/[\r\n]+/g, " ").slice(0, 150);
  const live = row.payload.slug ? PUBLIC_URL + encodeURIComponent(row.payload.slug) : ADMIN_URL;
  switch (row.event_type) {
    case "revision_tomada":
      return { subject: `Tu devocional está en revisión: ${t}`, title: "Tu devocional está en revisión",
        intro: "Una revisora empezó a revisar tu devocional. Te avisaremos cuando termine." };
    case "cambios_solicitados":
      return { subject: `Cambios solicitados en: ${t}`, title: "La revisora pidió algunos cambios",
        intro: "Revisa la nota, haz los ajustes y vuelve a enviarlo a revisión.", showNote: true,
        action: { label: "Abrir mi devocional", url: ADMIN_URL } };
    case "aprobado_publicado":
    case "publicado":
      return { subject: `¡Publicado! ${t}`, title: "Tu devocional ya está publicado",
        intro: "Ya pueden leerlo en la web y en la app de Mujeres con Propósito.",
        action: { label: "Ver devocional", url: live } };
    case "programado":
      return { subject: `Publicación programada: ${t}`, title: "Tu devocional fue aprobado",
        intro: row.payload.fecha
          ? `Se publicará automáticamente el ${formatDateEs(row.payload.fecha)}.`
          : "Se publicará automáticamente en la fecha programada." };
    case "despublicado":
      return { subject: `Devocional retirado: ${t}`, title: "Tu devocional se retiró de la web",
        intro: "El equipo lo retiró temporalmente. Puedes revisarlo en el panel.",
        action: { label: "Abrir el panel", url: ADMIN_URL } };
    case "eliminado":
      return { subject: `Devocional eliminado: ${t}`, title: "Tu devocional fue eliminado",
        intro: "El equipo eliminó este devocional. Si crees que es un error, escribe a la administración." };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Método no permitido." }, 405);
  try {
    if (!timingSafeEqual(req.headers.get("x-cron-secret") || "", requiredEnv("DEVOTIONAL_CRON_SECRET"))) {
      return jsonResponse({ ok: false, error: "No autorizado." }, 401);
    }
    const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const { data, error } = await admin
      .from("devocional_email_outbox")
      .select("id,event_type,recipients,attempts,payload")
      .is("sent_at", null)
      .lt("attempts", MAX_ATTEMPTS)
      .lte("available_at", new Date().toISOString())
      .order("id")
      .limit(BATCH);
    if (error) throw error;

    let sent = 0;
    let failed = 0;
    for (const row of (data || []) as Row[]) {
      const copy = copyFor(row);
      // Unknown event: mark as handled so it never blocks the queue.
      if (!copy || !row.recipients?.length) {
        await admin.from("devocional_email_outbox").update({ sent_at: new Date().toISOString(), last_error: "sin plantilla" }).eq("id", row.id);
        continue;
      }
      const titulo = row.payload.titulo || "Tu devocional";
      const note = copy.showNote && row.payload.nota ? row.payload.nota : "";
      try {
        for (const to of row.recipients) {
          await sendEmail({
            to,
            subject: copy.subject,
            text: [copy.intro, "", `Devocional: ${titulo}`, note ? `\nNota de la revisora:\n${note}` : "", copy.action ? `\n${copy.action.url}` : ""].join("\n"),
            html: renderEmail({
              preheader: copy.intro,
              eyebrow: "Tus devocionales",
              title: copy.title,
              intro: copy.intro,
              body: infoTable([{ label: "Devocional", value: titulo, accent: true }]) + (note ? messageBlock("Nota de la revisora", note) : ""),
              actions: copy.action ? [copy.action] : [],
              footer: "Aviso para autoras de Mujeres con Propósito",
            }),
          });
        }
        await admin.from("devocional_email_outbox").update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: null }).eq("id", row.id);
        sent++;
      } catch (sendError) {
        failed++;
        // Back off: retry in 5, 10, 15… minutes.
        const retryAt = new Date(Date.now() + (row.attempts + 1) * 5 * 60_000).toISOString();
        await admin.from("devocional_email_outbox").update({
          attempts: row.attempts + 1,
          available_at: retryAt,
          last_error: sendError instanceof Error ? sendError.message.slice(0, 500) : "error",
        }).eq("id", row.id);
      }
    }
    return jsonResponse({ ok: true, sent, failed });
  } catch (error) {
    console.error("send-devotional-updates", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "Error enviando avisos." }, 500);
  }
});
