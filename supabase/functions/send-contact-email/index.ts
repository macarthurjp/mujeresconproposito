import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const contactEmail = requiredEnv("CONTACT_EMAIL");
    const payload = await req.json();

    const nombre = String(payload.nombre || "").trim();
    const email = normalizeEmail(payload.email);
    const mensaje = String(payload.mensaje || "").trim();

    if (!nombre) throw new Error("El nombre es obligatorio.");
    if (!email) throw new Error("El correo es obligatorio.");
    if (!mensaje) throw new Error("El mensaje es obligatorio.");

    const safeNombre = escapeHtml(nombre);
    const safeEmail = escapeHtml(email);
    const safeMensaje = escapeHtml(mensaje).replace(/\n/g, "<br>");

    const providerResponse = await sendEmail({
      to: contactEmail,
      subject: `Nuevo mensaje de ${nombre} - Mujeres con Propósito`,
      text: [
        "Nuevo mensaje desde el formulario de contacto",
        "",
        `Nombre: ${nombre}`,
        `Email: ${email}`,
        "",
        "Mensaje:",
        mensaje,
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
                      <td align="center" style="padding:44px 34px 38px;background:linear-gradient(135deg,#fffaf8 0%,#fff4f2 100%);border-bottom:1px solid #f0ddda;">
                        <div style="margin:0 0 16px;color:#ad7671;font-size:14px;font-weight:800;letter-spacing:4px;text-transform:uppercase;">Mujeres con Propósito</div>
                        <h1 style="margin:0;color:#b55d5e;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:1.15;font-weight:700;">Nuevo mensaje de contacto</h1>
                        <p style="margin:18px 0 0;color:#687180;font-size:17px;line-height:1.55;">
                          <strong style="color:#354052;">${safeNombre}</strong> escribió a través del formulario del sitio.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:40px 38px 46px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 28px;border:1px solid #efdcda;border-radius:20px;overflow:hidden;">
                          <tr style="background:#fff8f6;">
                            <td style="width:34%;padding:14px 16px;color:#775f5c;font-weight:800;border-bottom:1px solid #f1e1df;">Nombre</td>
                            <td style="padding:14px 16px;color:#354052;border-bottom:1px solid #f1e1df;">${safeNombre}</td>
                          </tr>
                          <tr>
                            <td style="padding:14px 16px;color:#775f5c;font-weight:800;">Email</td>
                            <td style="padding:14px 16px;"><a href="mailto:${safeEmail}" style="color:#a94f52;text-decoration:underline;word-break:break-all;">${safeEmail}</a></td>
                          </tr>
                        </table>

                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 34px;background:#fff8f6;border:1px solid #efd5d1;border-left:6px solid #e7a39a;border-radius:20px;">
                          <tr>
                            <td style="padding:26px 24px;">
                              <p style="margin:0 0 10px;color:#8e403b;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;">Mensaje</p>
                              <p style="margin:0;color:#354052;font-size:17px;line-height:1.7;">${safeMensaje}</p>
                            </td>
                          </tr>
                        </table>

                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                          <tr>
                            <td align="center" bgcolor="#e7a39a" style="border-radius:999px;">
                              <a href="mailto:${safeEmail}" style="display:inline-block;padding:17px 34px;color:#ffffff;font-size:17px;font-weight:800;text-decoration:none;border-radius:999px;">
                                Responder por correo
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:24px 30px;background:#8f4547;color:#ffffff;">
                        <p style="margin:0 0 6px;font-size:15px;font-weight:800;">Mujeres con Propósito</p>
                        <p style="margin:0;color:#f5dddd;font-size:13px;line-height:1.5;">Notificación privada del formulario de contacto</p>
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

    return jsonResponse({ ok: true, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
