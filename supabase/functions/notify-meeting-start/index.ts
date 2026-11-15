// Called every minute by pg_cron (job "mcp930-meeting-start-push").
// Finds active events whose meeting has just started in their time zone and
// sends an Expo push notification to every registered device. Tapping the
// notification (or its "Unirme" action) opens the meeting link in the app.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEETING_CRON_SECRET,
//          EXPO_ACCESS_TOKEN (optional, only if push security is enabled in Expo).
//
// Body: {"scheduled": true}            normal cron run
//       {"dryRun": true, "at": "<ISO>"} report what would be sent, send nothing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { isValidTimeZone, parseSchedule, startedOccurrence } from "../_shared/schedule.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;
const SOON_MINUTES = 15;

type Evento = {
  id: string;
  titulo: string | null;
  horario: string | null;
  link: string | null;
  zona_horaria: string | null;
  ultimo_aviso_inicio: string | null;
  ultimo_aviso_previo: string | null;
};

type ExpoTicket = { status: "ok" | "error"; id?: string; message?: string; details?: { error?: string } };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function safeLink(value: string | null) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sendExpoBatch(messages: unknown[]): Promise<ExpoTicket[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(messages) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Expo push failed (${response.status}): ${JSON.stringify(payload).slice(0, 300)}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const cronSecret = requiredEnv("MEETING_CRON_SECRET");
    if (!timingSafeEqual(req.headers.get("x-cron-secret") || "", cronSecret)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const now = dryRun && body?.at ? new Date(body.at) : new Date();
    if (Number.isNaN(now.getTime())) return json({ error: "Invalid 'at'" }, 400);

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const { data: eventos, error: eventosError } = await supabase
      .from("eventos")
      .select("id,titulo,horario,link,zona_horaria,ultimo_aviso_inicio,ultimo_aviso_previo")
      .eq("activa", true)
      .eq("notificar", true);
    if (eventosError) throw eventosError;

    // Two alerts per occurrence: a heads-up 15 minutes before, and "started".
    type Kind = "soon" | "start";
    type Due = { evento: Evento; inicio: Date; link: string | null; kind: Kind };
    const due: Due[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    const markerColumn = (kind: Kind) => (kind === "soon" ? "ultimo_aviso_previo" : "ultimo_aviso_inicio");

    for (const evento of (eventos || []) as Evento[]) {
      const schedule = parseSchedule(evento.horario);
      if (!schedule) {
        skipped.push({ id: evento.id, reason: `horario no reconocido: ${evento.horario}` });
        continue;
      }
      const zone = evento.zona_horaria && isValidTimeZone(evento.zona_horaria)
        ? evento.zona_horaria
        : /europ/i.test(evento.titulo || "") ? "Europe/Luxembourg" : "America/Santo_Domingo";
      const link = safeLink(evento.link);

      // Starts within the next 5..15 minutes (cron runs every minute).
      const soon = startedOccurrence(schedule, zone, new Date(now.getTime() + SOON_MINUTES * 60_000), 10);
      if (soon && !(evento.ultimo_aviso_previo && new Date(evento.ultimo_aviso_previo).getTime() >= soon.getTime())) {
        due.push({ evento, inicio: soon, link, kind: "soon" });
      }

      const inicio = startedOccurrence(schedule, zone, now);
      if (inicio && !(evento.ultimo_aviso_inicio && new Date(evento.ultimo_aviso_inicio).getTime() >= inicio.getTime())) {
        due.push({ evento, inicio, link, kind: "start" });
      }
    }

    if (dryRun) {
      return json({
        dryRun: true,
        at: now.toISOString(),
        wouldNotify: due.map(({ evento, inicio, link, kind }) => ({ id: evento.id, titulo: evento.titulo, kind, inicio, link })),
        skipped,
      });
    }

    if (due.length === 0) return json({ ok: true, notified: 0 });

    const { data: tokens, error: tokensError } = await supabase.from("push_tokens").select("token").eq("activo", true).eq("avisos_reuniones", true);
    if (tokensError) throw tokensError;
    const recipients = (tokens || []).map((row: { token: string }) => row.token);

    const results = [];
    const deadTokens = new Set<string>();

    for (const { evento, inicio, link, kind } of due) {
      // Claim this occurrence atomically so overlapping cron runs never double-send.
      const column = markerColumn(kind);
      const { data: claimed, error: claimError } = await supabase
        .from("eventos")
        .update({ [column]: inicio.toISOString() })
        .eq("id", evento.id)
        .or(`${column}.is.null,${column}.lt.${inicio.toISOString()}`)
        .select("id");
      if (claimError) throw claimError;
      if (!claimed?.length) continue;

      const titulo = evento.titulo?.trim() || "Reunión de Mujeres con Propósito";
      const minutes = Math.max(1, Math.round((inicio.getTime() - now.getTime()) / 60_000));
      const content = kind === "soon"
        ? { title: `${titulo} empieza en ${minutes} minutos`, body: link ? "Prepárate. Te avisaremos cuando empiece para que te unas." : "Prepárate, comenzamos pronto." }
        : { title: "La reunión ha comenzado", body: link ? `${titulo} está en vivo. Toca para unirte.` : `${titulo} está comenzando.` };
      let sent = 0;

      for (let i = 0; i < recipients.length; i += EXPO_BATCH) {
        const batch = recipients.slice(i, i + EXPO_BATCH);
        const messages = batch.map((to) => ({
          to,
          ...content,
          // Start: own chime + live channel (stronger vibration on Android).
          sound: kind === "start" ? "reunion.wav" : "default",
          priority: "high",
          channelId: kind === "start" ? "reuniones-en-vivo" : "reuniones",
          // iOS: stands out on the lock screen and breaks through Focus.
          interruptionLevel: "time-sensitive",
          categoryId: kind === "start" && link ? "meeting" : undefined,
          data: { type: kind === "start" ? "meeting_start" : "meeting_soon", eventoId: evento.id, titulo, link, inicio: inicio.toISOString() },
        }));

        const tickets = await sendExpoBatch(messages);
        tickets.forEach((ticket, index) => {
          if (ticket.status === "ok") sent += 1;
          else if (ticket.details?.error === "DeviceNotRegistered") deadTokens.add(batch[index]);
        });
      }

      results.push({ id: evento.id, titulo, kind, inicio, sent });
    }

    if (deadTokens.size) {
      await supabase.from("push_tokens").update({ activo: false }).in("token", [...deadTokens]);
    }

    return json({ ok: true, notified: results.length, results, deactivatedTokens: deadTokens.size, skipped });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
