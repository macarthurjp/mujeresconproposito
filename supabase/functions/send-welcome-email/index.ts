import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json();
    const email = String(payload.email || "").trim();
    const nombre = String(payload.nombre || "").trim() || "amada";
    const comunidad = String(payload.comunidad || "").trim();

    if (!email) {
      return jsonResponse({ ok: false, error: "Missing email" }, 400);
    }

    const safeName = escapeHtml(nombre);
    const safeCommunity = escapeHtml(comunidad);
    const siteUrl = "https://macarthurjp.github.io/mujeresconproposito/";

    const providerResponse = await sendEmail({
      to: email,
      subject: `${nombre}, bienvenida a Mujeres con Propósito`,
      text: [
        `¡Bienvenida, ${nombre}!`,
        "",
        "Nos alegra mucho que ahora formes parte de esta comunidad de fe, crecimiento y propósito.",
        comunidad ? `Hemos recibido tu solicitud para la comunidad: ${comunidad}.` : "",
        "Oramos para que este sea un tiempo de crecimiento, fe, bendición y propósito para tu vida.",
        "",
        "“El Señor cumplirá en mí su propósito.” — Salmo 138:8",
        "",
        `Entrar a la comunidad: ${siteUrl}`,
      ].filter(Boolean).join("\n"),
      html: `
        <!doctype html>
        <html lang="es">
          <body style="margin:0;padding:0;background-color:#f8f4f3;color:#354052;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f4f3;">
              <tr>
                <td align="center" style="padding:38px 16px;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #ecd8d4;border-radius:28px;overflow:hidden;box-shadow:0 18px 50px rgba(105,65,60,0.08);">
                    <tr>
                      <td align="center" style="padding:48px 34px 42px;background:linear-gradient(135deg,#fffaf8 0%,#fff4f2 100%);border-bottom:1px solid #f0ddda;">
                        <div style="margin:0 0 18px;color:#ad7671;font-size:14px;font-weight:800;letter-spacing:4px;text-transform:uppercase;">
                          Mujeres con Propósito
                        </div>
                        <h1 style="margin:0;color:#b55d5e;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.12;font-weight:700;">
                          ¡Bienvenida, ${safeName}!
                        </h1>
                        <p style="max-width:540px;margin:22px auto 0;color:#687180;font-size:20px;line-height:1.55;">
                          Nos alegra mucho que ahora formes parte de esta comunidad de fe, crecimiento y propósito.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:42px 38px 46px;">
                        <p style="margin:0 0 22px;color:#354052;font-size:18px;line-height:1.75;">
                          Estamos muy felices de recibirte, <strong style="color:#293241;">${safeName}</strong>.
                        </p>
                        ${safeCommunity ? `
                          <p style="margin:0 0 22px;color:#354052;font-size:18px;line-height:1.75;">
                            Tu solicitud para formar parte de la comunidad <strong style="color:#a94f52;">${safeCommunity}</strong> fue recibida correctamente.
                          </p>
                        ` : ""}
                        <p style="margin:0 0 30px;color:#354052;font-size:18px;line-height:1.75;">
                          Oramos para que este sea un tiempo de crecimiento, fe, bendición y propósito para tu vida. Muy pronto una de nuestras líderes se pondrá en contacto contigo.
                        </p>

                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 34px;background:#fff8f6;border:1px solid #efd5d1;border-left:6px solid #e7a39a;border-radius:20px;">
                          <tr>
                            <td align="center" style="padding:28px 24px;">
                              <p style="margin:0 0 12px;color:#704f4c;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.55;font-style:italic;">
                                “El Señor cumplirá en mí su propósito.”
                              </p>
                              <p style="margin:0;color:#b55d5e;font-size:17px;font-weight:800;">— Salmo 138:8</p>
                            </td>
                          </tr>
                        </table>

                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 30px;">
                          <tr>
                            <td align="center" bgcolor="#e7a39a" style="border-radius:999px;">
                              <a href="${siteUrl}" target="_blank" style="display:inline-block;padding:17px 34px;color:#ffffff;font-size:17px;font-weight:800;text-decoration:none;border-radius:999px;">
                                Entrar a la comunidad
                              </a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin:0;text-align:center;color:#7a8290;font-size:14px;line-height:1.6;">
                          Si el botón no funciona, visita:<br>
                          <a href="${siteUrl}" style="color:#a94f52;text-decoration:underline;word-break:break-all;">${siteUrl}</a>
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:24px 30px;background:#8f4547;color:#ffffff;">
                        <p style="margin:0 0 6px;font-size:15px;font-weight:800;">Mujeres con Propósito</p>
                        <p style="margin:0;color:#f5dddd;font-size:13px;line-height:1.5;">Fe · Hermandad · Crecimiento · Propósito</p>
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
