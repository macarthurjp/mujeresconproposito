// Called every 15 minutes by pg_cron (job "mcp930-birthday-push").
// Sends each app user the birthday reminders they chose in
// Más → Avisos de cumpleaños ("2 días antes", "1 día antes", "el mismo día")
// at their chosen time, in the phone's own time zone.
//
// Privacy: advance reminders use the first name only (same as the public
// "Esta semana" list); the same-day reminder uses the full name, as shown in
// the app's "Hoy celebramos".
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BIRTHDAY_CRON_SECRET,
//          EXPO_ACCESS_TOKEN (optional).
// Body: {"scheduled": true} | {"dryRun": true, "at": "<ISO>"}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { addDaysISO, birthdayMatches } from "../_shared/birthdays.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH = 100;
const FALLBACK_ZONE = "Europe/Luxembourg";

type Device = { token: string; zona_horaria: string | null; cumple_avisos: number[] | null; cumple_hora: number; cumple_minuto: number };
type Member = { nombre: string | null; apellido: string | null; fecha_nacimiento: string };
type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function validZone(zone: string | null) {
  if (!zone) return FALLBACK_ZONE;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return zone; } catch { return FALLBACK_ZONE; }
}

function localNow(now: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return { iso: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, minute: Number(get("minute")) };
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] || "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function message(daysBefore: number, names: string[]) {
  const many = names.length > 1;
  const who = joinNames(names);
  if (daysBefore === 0) return { title: "🎂 ¡Hoy es su cumpleaños!", body: `Hoy ${many ? "cumplen" : "cumple"} años ${who}. ¡No olvides felicitar${many ? "las" : "la"}!` };
  if (daysBefore === 1) return { title: "🎂 Cumpleaños mañana", body: `Mañana ${many ? "cumplen" : "cumple"} años ${who}.` };
  return { title: `🎂 Cumpleaños en ${daysBefore} días`, body: `${who} ${many ? "cumplen" : "cumple"} años en ${daysBefore} días.` };
}

async function sendExpoBatch(messages: unknown[]): Promise<ExpoTicket[]> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
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
    if (!timingSafeEqual(req.headers.get("x-cron-secret") || "", requiredEnv("BIRTHDAY_CRON_SECRET"))) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const now = body?.at ? new Date(body.at) : new Date();
    if (Number.isNaN(now.getTime())) return json({ error: "Invalid 'at'" }, 400);

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: devices, error: deviceError } = await supabase
      .from("push_tokens")
      .select("token,zona_horaria,cumple_avisos,cumple_hora,cumple_minuto")
      .eq("activo", true)
      .neq("cumple_avisos", "{}");
    if (deviceError) throw deviceError;

    // Devices whose chosen time falls in this 15-minute window.
    const due = (devices as Device[] || []).map((device) => ({ device, local: localNow(now, validZone(device.zona_horaria)) }))
      .filter(({ device, local }) => local.hour === device.cumple_hora && local.minute >= device.cumple_minuto && local.minute < device.cumple_minuto + 15);
    if (!due.length) return json({ ok: true, due: 0, sent: 0 });

    const { data: memberRows, error: memberError } = await supabase
      .from("unirse")
      .select("nombre,apellido,fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);
    if (memberError) throw memberError;
    const members = (memberRows || []) as Member[];

    const outgoing: { to: string; title: string; body: string; dias: number }[] = [];
    for (const { device, local } of due) {
      for (const dias of [...new Set(device.cumple_avisos || [])].sort()) {
        const target = addDaysISO(local.iso, dias);
        const people = members.filter((m) => birthdayMatches(m.fecha_nacimiento, target));
        if (!people.length) continue;

        const keyed = people.map((m) => ({
          m,
          key: `${(m.nombre || "").trim().toLowerCase()}|${(m.apellido || "").trim().toLowerCase()}|${m.fecha_nacimiento.slice(5, 10)}`,
        }));
        let fresh = keyed;
        if (!dryRun) {
          const { data: inserted, error } = await supabase
            .from("birthday_push_log")
            .upsert(keyed.map(({ key }) => ({ token: device.token, member_key: key, dias_antes: dias, fecha: target })), { onConflict: "token,member_key,dias_antes,fecha", ignoreDuplicates: true })
            .select("member_key");
          if (error) throw error;
          const keys = new Set((inserted || []).map((r: { member_key: string }) => r.member_key));
          fresh = keyed.filter(({ key }) => keys.has(key));
        }
        if (!fresh.length) continue;

        const names = fresh.map(({ m }) => (dias === 0
          ? [m.nombre, m.apellido].filter(Boolean).join(" ").trim()
          : String(m.nombre || "").trim().split(/\s+/)[0]) || "una hermana");
        const text = message(dias, [...new Set(names)]);
        outgoing.push({ to: device.token, ...text, dias });
      }
    }

    if (dryRun) return json({ ok: true, dryRun: true, due: due.length, wouldSend: outgoing });

    let sent = 0;
    const dead = new Set<string>();
    for (let i = 0; i < outgoing.length; i += EXPO_BATCH) {
      const batch = outgoing.slice(i, i + EXPO_BATCH);
      const tickets = await sendExpoBatch(batch.map((m) => ({
        to: m.to, title: m.title, body: m.body, sound: "default", priority: "high", channelId: "reuniones",
        data: { type: "birthday_push", diasAntes: m.dias },
      })));
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") sent += 1;
        else if (ticket.details?.error === "DeviceNotRegistered") dead.add(batch[index].to);
      });
    }
    if (dead.size) await supabase.from("push_tokens").update({ activo: false }).in("token", [...dead]);

    return json({ ok: true, due: due.length, sent, deactivatedTokens: dead.size });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
