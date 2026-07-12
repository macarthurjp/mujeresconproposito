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
    const safeEmail = escapeHtml(email);
    const dashboardUrl = "https://macarthurjp.github.io/mujeresconproposito/dashboard.html";

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
        <!doctype html>
        <html lang="es">
          <body style="margin:0;padding:0;background-color:#f8f4f3;color:#354052;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f4f3;">
              <tr>
                <td align="center" style="padding:38px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:700px;background:#ffffff;border:1px solid #ecd8d4;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(105,65,60,0.08);">
                    <tr>
                      <td align="center" style="padding:42px 34px 38px;background:linear-gradient(135deg,#fffaf8 0%,#fff4f2 100%);border-bottom:1px solid #f0ddda;">
                        <div style="margin:0 0 16px;color:#ad7671;font-size:14px;font-weight:800;letter-spacing:4px;text-transform:uppercase;">Mujeres con Propósito</div>
                        <h1 style="margin:0;color:#b55d5e;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.15;">Nuevo formulario recibido</h1>
                        <p style="margin:18px 0 0;color:#687180;font-size:17px;line-height:1.55;">
                          <strong style="color:#354052;">${escapeHtml(fullName)}</strong> desea formar parte de la comunidad.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:36px 34px 42px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #efdcda;border-radius:20px;overflow:hidden;">
                          <tr style="background:#fff8f6;"><td style="width:42%;padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Nombre</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(nombre)}</td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Apellido</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(apellido)}</td></tr>
                          <tr style="background:#fff8f6;"><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Email</td><td style="padding:14px 16px;border-bottom:1px solid #f1e1df;"><a href="mailto:${safeEmail}" style="color:#a94f52;text-decoration:underline;word-break:break-all;">${safeEmail}</a></td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Teléfono</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(telefono)}</td></tr>
                          <tr style="background:#fff8f6;"><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Fecha de nacimiento</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(fechaNacimiento)}</td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Estatus matrimonial</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(estatusMatrimonial)}</td></tr>
                          <tr style="background:#fff8f6;"><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">País de nacimiento</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(paisNacimiento)}</td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">País de residencia</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(paisResidencia)}</td></tr>
                          <tr style="background:#fff8f6;"><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Cristiana</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(cristiana)}</td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Comunidad</td><td style="padding:14px 16px;color:#a94f52;font-weight:800;border-bottom:1px solid #f1e1df;">${escapeHtml(comunidad)}</td></tr>
                          <tr style="background:#fff8f6;"><td style="padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Hijos</td><td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${escapeHtml(hijos)}</td></tr>
                          <tr><td style="padding:14px 16px;color:#775f5c;font-weight:800;vertical-align:top;">Comentarios</td><td style="padding:14px 16px;color:#354052;line-height:1.6;">${escapeHtml(comments) || "Sin comentarios"}</td></tr>
                        </table>

                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:32px auto 22px;">
                          <tr>
                            ${email ? `<td align="center" bgcolor="#e7a39a" style="border-radius:999px;"><a href="mailto:${safeEmail}" style="display:inline-block;padding:15px 26px;color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;border-radius:999px;">Responder por correo</a></td><td width="12"></td>` : ""}
                            <td align="center" bgcolor="#8f4547" style="border-radius:999px;"><a href="${dashboardUrl}" target="_blank" style="display:inline-block;padding:15px 26px;color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;border-radius:999px;">Abrir dashboard</a></td>
                          </tr>
                        </table>

                        <p style="margin:0;text-align:center;color:#7a8290;font-size:13px;line-height:1.6;">Este registro fue enviado desde el formulario de Mujeres con Propósito.</p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:22px 30px;background:#8f4547;color:#ffffff;">
                        <p style="margin:0 0 5px;font-size:15px;font-weight:800;">Mujeres con Propósito</p>
                        <p style="margin:0;color:#f5dddd;font-size:13px;">Notificación privada de registro</p>
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

    return jsonResponse({ ok: true, sentTo: contactEmail, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
