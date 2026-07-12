
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Member = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  ultimo_correo_cumpleanos: string | null;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getLuxembourgTodayMonthDay() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${month}-${day}`;
}

function getLuxembourgTodayISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}`;
}

function getLuxembourgHour() {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Luxembourg",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());

  return Number(hour);
}

function wasSentToday(value: string | null) {
  if (!value) return false;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Luxembourg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";

  return `${year}-${month}-${day}` === getLuxembourgTodayISO();
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const brevoApiKey = requiredEnv("BREVO_API_KEY");
  const fromEmail = requiredEnv("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME") || "Mujeres con Propósito";

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify({
      sender: {
        name: fromName,
        email: fromEmail,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Brevo error ${response.status}: ${responseText}`);
  }

  return responseText ? JSON.parse(responseText) : { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const cronSecret = requiredEnv("BIRTHDAY_CRON_SECRET");
    const requestSecret = req.headers.get("x-cron-secret") || "";
    const payload = await req.json().catch(() => ({}));
    const memberId = String(payload?.memberId || "").trim();
    const scheduled = payload?.scheduled === true;
    const validMemberId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(memberId);
    const validCronSecret = Boolean(requestSecret) && requestSecret === cronSecret;

    if (!validCronSecret && !validMemberId && !scheduled) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    if (scheduled && !validCronSecret && getLuxembourgHour() !== 8) {
      return jsonResponse({ ok: true, skipped: true, reason: "outside_luxembourg_08_hour" });
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const todayMonthDay = getLuxembourgTodayMonthDay();
    const todayISO = getLuxembourgTodayISO();

    let membersQuery = supabase
      .from("unirse")
      .select("id,nombre,apellido,email,fecha_nacimiento,ultimo_correo_cumpleanos")
      .not("email", "is", null)
      .not("fecha_nacimiento", "is", null);

    if (validMemberId) {
      membersQuery = membersQuery.eq("id", memberId);
    }

    const { data, error } = await membersQuery;

    if (error) throw error;

    const birthdayMembers = (data || []).filter((member: Member) => {
      if (!member.fecha_nacimiento || !member.email) return false;
      if (wasSentToday(member.ultimo_correo_cumpleanos)) return false;
      return member.fecha_nacimiento.slice(5, 10) === todayMonthDay;
    });

    const results = [];

    for (const member of birthdayMembers) {
      const safeNombre = escapeHtml(member.nombre || "");
      const safeApellido = escapeHtml(member.apellido || "");
      const nombreCompleto = `${safeNombre} ${safeApellido}`.trim();
      const displayName = nombreCompleto || safeNombre || "amada";

      const providerResponse = await sendEmail({
        to: member.email!,
        subject: `🎉 ¡Feliz cumpleaños${safeNombre ? `, ${safeNombre}` : ""}!`,
        text: [
          `Querida ${displayName},`,
          "",
          "Hoy damos gracias a Dios por tu vida.",
          "Deseamos que este nuevo año esté lleno de amor, paz, salud, propósito y bendición.",
          "",
          "“El Señor te bendiga y te guarde.”",
          "— Números 6:24",
          "",
          "Con cariño,",
          "Mujeres con Propósito",
        ].join("\n"),
        html: `
          <!doctype html>
          <html lang="es">
            <body style="margin:0;padding:0;background-color:#f8f4f3;color:#354052;font-family:Arial,Helvetica,sans-serif;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f4f3;">
                <tr>
                  <td align="center" style="padding:38px 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #ecd8d4;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(105,65,60,0.08);">
                      <tr>
                        <td align="center" style="padding:44px 34px 40px;background:linear-gradient(135deg,#fffaf8 0%,#fff4f2 100%);border-bottom:1px solid #f0ddda;">
                          <div style="margin:0 0 16px;color:#ad7671;font-size:14px;font-weight:800;letter-spacing:4px;text-transform:uppercase;">Mujeres con Propósito</div>
                          <div style="margin:0 0 14px;font-size:42px;line-height:1;">🎂</div>
                          <h1 style="margin:0;color:#b55d5e;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.12;font-weight:700;">¡Feliz cumpleaños!</h1>
                          <p style="margin:18px 0 0;color:#687180;font-size:19px;line-height:1.55;">Celebramos tu vida con mucho amor</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:42px 38px 46px;">
                          <p style="margin:0 0 22px;color:#354052;font-size:18px;line-height:1.75;">
                            Querida <strong style="color:#a94f52;">${displayName}</strong>,
                          </p>
                          <p style="margin:0 0 28px;color:#354052;font-size:18px;line-height:1.75;">
                            Hoy damos gracias a Dios por tu vida. Eres una bendición y oramos para que este nuevo año venga lleno de paz, amor, salud, crecimiento espiritual y propósito.
                          </p>

                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 30px;background:#fff8f6;border:1px solid #efd5d1;border-left:6px solid #e7a39a;border-radius:20px;">
                            <tr>
                              <td align="center" style="padding:28px 24px;">
                                <p style="margin:0 0 12px;color:#704f4c;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.55;font-style:italic;">“El Señor te bendiga y te guarde.”</p>
                                <p style="margin:0;color:#b55d5e;font-size:17px;font-weight:800;">— Números 6:24</p>
                              </td>
                            </tr>
                          </table>

                          <p style="margin:0;color:#354052;font-size:18px;line-height:1.75;">
                            Que el amor de Dios te acompañe siempre y que cada paso que des esté lleno de gracia y favor.
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:24px 30px;background:#8f4547;color:#ffffff;">
                          <p style="margin:0 0 6px;font-size:15px;font-weight:800;">Mujeres con Propósito</p>
                          <p style="margin:0;color:#f5dddd;font-size:13px;line-height:1.5;">Con mucho cariño y bendiciones 💖</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });

      const { error: updateError } = await supabase
        .from("unirse")
        .update({ ultimo_correo_cumpleanos: new Date().toISOString() })
        .eq("id", member.id);

      if (updateError) throw updateError;

      results.push({ id: member.id, providerResponse });
    }

    return jsonResponse({
      ok: true,
      date: todayISO,
      birthdayKey: todayMonthDay,
      checked: (data || []).length,
      sent: results.length,
      results: validCronSecret ? results : results.map(({ id }) => ({ id })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
