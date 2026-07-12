
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
          <div style="margin:0; padding:30px 20px; background:#fff7f6; font-family:Arial,sans-serif; color:#333;">
            <div style="max-width:620px; margin:0 auto; background:linear-gradient(180deg, #ffffff 0%, #fffafa 100%); border:1px solid #f3d5d1; border-radius:24px; box-shadow:0 10px 30px rgba(0,0,0,0.08); overflow:hidden;">
              <div style="background:linear-gradient(135deg, #e7a8a0 0%, #f3d5d1 100%); padding:38px 30px; text-align:center;">
                <div style="font-size:44px; line-height:1; margin-bottom:10px;">🎂</div>
                <h1 style="margin:0; font-size:30px; color:#ffffff; font-weight:700;">¡Feliz Cumpleaños!</h1>
                <p style="margin:12px 0 0 0; color:#fffaf9; font-size:16px;">Celebramos tu vida con mucho amor</p>
              </div>

              <div style="padding:36px 32px;">
                <p style="font-size:18px; margin-top:0; margin-bottom:18px;">
                  Querida <strong style="color:#b05f5f;">${displayName}</strong>
                </p>

                <p style="font-size:16px; line-height:1.8; margin:0 0 18px 0;">
                  Hoy damos gracias a Dios por tu vida${nombreCompleto ? `, <strong>${nombreCompleto}</strong>` : ""}.
                  Eres una bendición y oramos para que este nuevo año venga lleno de paz, amor, salud,
                  crecimiento espiritual y propósito.
                </p>

                <div style="margin:26px 0; padding:22px 20px; background:#fff7f6; border-left:5px solid #e7a8a0; border-radius:14px; text-align:center;">
                  <p style="margin:0; font-size:19px; font-style:italic; color:#6a4a4a; line-height:1.8;">
                    “El Señor te bendiga y te guarde.”
                  </p>
                  <p style="margin:10px 0 0 0; font-size:15px; font-weight:bold; color:#b05f5f;">
                    — Números 6:24
                  </p>
                </div>

                <p style="font-size:16px; line-height:1.8; margin:0 0 20px 0;">
                  Que el amor de Dios te acompañe siempre y que cada paso que des esté lleno de gracia y favor.
                </p>

                <div style="text-align:center; margin:30px 0 10px 0;">
                  <span style="display:inline-block; padding:12px 26px; background:linear-gradient(135deg, #e7a8a0 0%, #f3d5d1 100%); color:#ffffff; border-radius:999px; font-size:15px; font-weight:700;">
                    Mujeres con Propósito
                  </span>
                </div>

                <p style="margin:30px 0 0 0; text-align:center; font-size:14px; color:#888;">
                  Con mucho cariño y bendiciones 💖
                </p>
              </div>
            </div>
          </div>
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
