const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}) {
  const brevoApiKey = requiredEnv("BREVO_API_KEY");
  const fromEmail = requiredEnv("FROM_EMAIL");
  const fromName = Deno.env.get("FROM_NAME") || "Mujeres con Propósito";

  const recipients = Array.isArray(to)
    ? to.map((email) => ({ email }))
    : String(to)
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

  if (!recipients.length) {
    throw new Error("No hay destinatarios configurados.");
  }

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
      to: recipients,
      subject,
      htmlContent: html,
      textContent: text,
      replyTo: replyTo ? { email: replyTo } : undefined,
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
    const contactEmail = requiredEnv("CONTACT_EMAIL");
    const data = await req.json();

    const nombre = String(data.nombre || "").trim();
    const apellido = String(data.apellido || "").trim();
    const email = normalizeEmail(data.email);
    const telefono = String(data.telefono || "").trim();
    const fechaNacimiento = String(data.fecha_nacimiento || "").trim();
    const estatusMatrimonial = String(data.estatus_matrimonial || "").trim();
    const paisNacimiento = String(data.pais_nacimiento || "").trim();
    const paisResidencia = String(data.pais_residencia || "").trim();
    const cristiana = String(data.cristiana || "").trim();
    const comunidad = String(data.comunidad || "").trim();
    const hijos = String(data.hijos ?? "0").trim();
    const comments = String(data.comments || "").trim();

    const fullName = [nombre, apellido].filter(Boolean).join(" ") || "Nuevo registro";

    const providerResponse = await sendEmail({
      to: contactEmail,
      subject: `Nuevo registro: ${fullName}`,
      replyTo: email || undefined,
      text: [
        "Nuevo formulario recibido",
        "",
        `Nombre: ${nombre}`,
        `Apellido: ${apellido}`,
        `Email: ${email}`,
        `Telefono: ${telefono}`,
        `Fecha de nacimiento: ${fechaNacimiento}`,
        `Estatus matrimonial: ${estatusMatrimonial}`,
        `Pais de nacimiento: ${paisNacimiento}`,
        `Pais de residencia: ${paisResidencia}`,
        `Cristiana: ${cristiana}`,
        `Comunidad: ${comunidad}`,
        `Hijos: ${hijos}`,
        `Comentarios: ${comments}`,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;color:#333;line-height:1.6;padding:20px;background:#fff7f6;">
          <div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #f3d5d1;box-shadow:0 6px 18px rgba(0,0,0,0.08);">
            <h2 style="color:#b05f5f;margin-top:0;">Nuevo formulario recibido</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px;font-weight:bold;">Nombre</td><td style="padding:8px;">${escapeHtml(nombre)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Apellido</td><td style="padding:8px;">${escapeHtml(apellido)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${escapeHtml(email)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Teléfono</td><td style="padding:8px;">${escapeHtml(telefono)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Fecha de nacimiento</td><td style="padding:8px;">${escapeHtml(fechaNacimiento)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Estatus matrimonial</td><td style="padding:8px;">${escapeHtml(estatusMatrimonial)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">País de nacimiento</td><td style="padding:8px;">${escapeHtml(paisNacimiento)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">País de residencia</td><td style="padding:8px;">${escapeHtml(paisResidencia)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Cristiana</td><td style="padding:8px;">${escapeHtml(cristiana)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Comunidad</td><td style="padding:8px;">${escapeHtml(comunidad)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Hijos</td><td style="padding:8px;">${escapeHtml(hijos)}</td></tr>
              <tr><td style="padding:8px;font-weight:bold;">Comentarios</td><td style="padding:8px;">${escapeHtml(comments)}</td></tr>
            </table>

            <p style="margin-top:24px;">Este registro fue enviado desde el formulario de Mujeres con Propósito.</p>
          </div>
        </div>
      `,
    });

    return jsonResponse({ ok: true, sentTo: contactEmail, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
