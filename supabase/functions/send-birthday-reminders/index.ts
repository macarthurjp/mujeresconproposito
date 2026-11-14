// Sends the birthday-calendar team a heads-up two days before each member's
// birthday. Recipients: user_roles with the "birthday_calendar" permission.
//
// Called hourly by pg_cron (job "mcp930-birthday-reminders-hourly-check");
// only acts during the 08:00 hour in Luxembourg, once per target date.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BIRTHDAY_CRON_SECRET,
//          BREVO_API_KEY, FROM_EMAIL, FROM_NAME (optional).
//
// Body: {"scheduled": true}                     normal cron run
//       {"dryRun": true, "today": "2026-11-14"} report only, sends nothing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { addDaysISO, birthdayMatches, luxembourgHour, luxembourgTodayISO } from "../_shared/birthdays.ts";

const DAYS_AHEAD = 2;

type Member = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  telefono: string | null;
  comunidad: string | null;
  pais_residencia: string | null;
  fecha_nacimiento: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timingSafeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function formatLongDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function turningAge(birthISO: string, targetISO: string) {
  const birthYear = Number(birthISO.slice(0, 4));
  const targetYear = Number(targetISO.slice(0, 4));
  const age = targetYear - birthYear;
  return age > 0 && age < 120 ? age : null;
}

function fullName(m: Member) {
  return `${m.nombre || ""} ${m.apellido || ""}`.trim() || "Integrante";
}

function buildEmail(members: Member[], targetISO: string) {
  const dateLabel = formatLongDate(targetISO);
  const rows = members.map((m) => {
    const age = m.fecha_nacimiento ? turningAge(m.fecha_nacimiento, targetISO) : null;
    const details = [m.comunidad, m.pais_residencia].filter(Boolean).join(" · ");
    const contact = [m.email, m.telefono].filter(Boolean).join(" · ");
    return { m, age, details, contact };
  });

  const text = [
    `Recordatorio: cumpleaños el ${dateLabel} (en ${DAYS_AHEAD} días).`,
    "",
    ...rows.map(({ m, age, details, contact }) =>
      `• ${fullName(m)}${age ? ` — cumple ${age}` : ""}${details ? ` (${details})` : ""}${contact ? `\n  ${contact}` : ""}`
    ),
    "",
    "Mujeres con Propósito",
  ].join("\n");

  const htmlRows = rows.map(({ m, age, details, contact }) => `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #f0ddda;">
        <div style="font-size:17px;font-weight:700;color:#3f2623;">${escapeHtml(fullName(m))}${age ? ` <span style="font-weight:500;color:#a64b43;">· cumple ${age}</span>` : ""}</div>
        ${details ? `<div style="margin-top:4px;font-size:14px;color:#6d5250;">${escapeHtml(details)}</div>` : ""}
        ${contact ? `<div style="margin-top:4px;font-size:14px;color:#6d5250;">${escapeHtml(contact)}</div>` : ""}
      </td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#fff7f6;font-family:Arial,Helvetica,sans-serif;color:#3f2623;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fff7f6;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #f0ddda;border-radius:24px;">
          <tr><td style="padding:32px 32px 8px;">
            <div style="font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#a64b43;">Calendario de cumpleaños</div>
            <h1 style="margin:10px 0 6px;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:30px;line-height:1.15;color:#3f2623;">Cumpleaños en ${DAYS_AHEAD} días</h1>
            <p style="margin:0;font-size:16px;color:#6d5250;text-transform:capitalize;">${escapeHtml(dateLabel)}</p>
          </td></tr>
          <tr><td style="padding:8px 32px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${htmlRows}</table>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#f9edea;border-radius:0 0 24px 24px;font-size:13px;color:#6d5250;">
            Recibes este aviso porque tienes el permiso «Calendario de cumpleaños» en el panel de administración.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const subject = members.length === 1
    ? `🎂 En ${DAYS_AHEAD} días: cumpleaños de ${fullName(members[0])}`
    : `🎂 En ${DAYS_AHEAD} días: ${members.length} cumpleaños`;

  return { subject, text, html };
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": requiredEnv("BREVO_API_KEY") },
    body: JSON.stringify({
      sender: { name: Deno.env.get("FROM_NAME") || "Mujeres con Propósito", email: requiredEnv("FROM_EMAIL") },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!response.ok) throw new Error(`Brevo error ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    if (!timingSafeEqual(req.headers.get("x-cron-secret") || "", requiredEnv("BIRTHDAY_CRON_SECRET"))) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;
    const todayISO = dryRun && /^\d{4}-\d{2}-\d{2}$/.test(String(body?.today || "")) ? String(body.today) : luxembourgTodayISO();

    if (!dryRun && luxembourgHour() !== 8) {
      return json({ ok: true, skipped: true, reason: "outside_luxembourg_08_hour" });
    }

    const targetISO = addDaysISO(todayISO, DAYS_AHEAD);
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    if (!dryRun) {
      const { data: already } = await supabase.from("birthday_reminder_log").select("target_date").eq("target_date", targetISO).maybeSingle();
      if (already) return json({ ok: true, skipped: true, reason: "already_sent", target: targetISO });
    }

    const { data: membersData, error: membersError } = await supabase
      .from("unirse")
      .select("id,nombre,apellido,email,telefono,comunidad,pais_residencia,fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);
    if (membersError) throw membersError;

    const members = ((membersData || []) as Member[])
      .filter((m) => birthdayMatches(m.fecha_nacimiento!, targetISO))
      .sort((a, b) => fullName(a).localeCompare(fullName(b), "es"));

    const { data: rolesData, error: rolesError } = await supabase
      .from("user_roles")
      .select("email,is_revoked,permissions")
      .contains("permissions", ["birthday_calendar"]);
    if (rolesError) throw rolesError;

    const recipients = [...new Set(
      (rolesData || [])
        .filter((r: { email: string | null; is_revoked: boolean | null }) => r.email && !r.is_revoked)
        .map((r: { email: string }) => r.email.trim().toLowerCase()),
    )];

    if (dryRun) {
      return json({ ok: true, dryRun: true, today: todayISO, target: targetISO, recipients, birthdays: members.map(fullName) });
    }

    if (!members.length || !recipients.length) {
      return json({ ok: true, sent: 0, target: targetISO, birthdays: members.length, recipients: recipients.length });
    }

    // Claim the date first so overlapping runs never double-send.
    const { error: claimError } = await supabase.from("birthday_reminder_log").insert({ target_date: targetISO, recipients: recipients.length, birthdays: members.length });
    if (claimError) {
      if (String(claimError.code) === "23505") return json({ ok: true, skipped: true, reason: "already_sent", target: targetISO });
      throw claimError;
    }

    const { subject, html, text } = buildEmail(members, targetISO);
    const failures: string[] = [];
    for (const to of recipients) {
      try {
        await sendEmail(to, subject, html, text);
      } catch (error) {
        console.error(error);
        failures.push(to);
      }
    }

    if (failures.length === recipients.length) {
      // Nothing went out: release the claim so the next hourly run can retry.
      await supabase.from("birthday_reminder_log").delete().eq("target_date", targetISO);
      throw new Error("No se pudo enviar ningún aviso.");
    }

    return json({ ok: true, target: targetISO, birthdays: members.length, sent: recipients.length - failures.length, failed: failures.length });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
