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

    const providerResponse = await sendEmail({
      to: email,
      subject: "Bienvenida a Mujeres con Proposito",
      text: `Hola ${nombre}, gracias por unirte a Mujeres con Proposito.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:28px;color:#33211f;">
          <div style="background:#fff7f6;border:1px solid #f0d7d3;border-radius:24px;padding:28px;">
            <h1 style="margin:0 0 12px;color:#8e403b;font-size:30px;">Bienvenida, ${safeName}</h1>
            <p style="font-size:17px;line-height:1.65;margin:0 0 16px;">
              Gracias por unirte a <strong>Mujeres con Proposito</strong>.
            </p>
            ${safeCommunity ? `
              <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
                Hemos recibido tu solicitud para la comunidad: <strong>${safeCommunity}</strong>.
              </p>
            ` : ""}
            <p style="font-size:16px;line-height:1.6;margin:0;">
              Muy pronto estaremos en contacto contigo. Que Dios siga afirmando Su proposito en tu vida.
            </p>
          </div>
        </div>
      `,
    });

    return jsonResponse({ ok: true, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
