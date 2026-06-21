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
    const safeMensaje = escapeHtml(mensaje);

    const providerResponse = await sendEmail({
      to: contactEmail,
      subject: `Nuevo mensaje de ${nombre} - Mujeres con Proposito`,
      text: [
        "Nuevo mensaje desde el formulario",
        "",
        `Nombre: ${nombre}`,
        `Email: ${email}`,
        "",
        "Mensaje:",
        mensaje,
      ].join("\n"),
      html: `
        <div style="margin:0;padding:24px;background:#fff7f6;font-family:Arial,sans-serif;color:#333;">
          <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #f3d5d1;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
            <div style="padding:24px 28px;background:linear-gradient(135deg,#e7a8a0,#f3d5d1);color:#ffffff;">
              <div style="font-size:28px;font-weight:800;line-height:1.2;">Mujeres con Proposito</div>
              <div style="font-size:15px;opacity:0.95;">Nuevo mensaje recibido</div>
            </div>
            <div style="padding:28px;">
              <p><strong>Nombre:</strong> ${safeNombre}</p>
              <p><strong>Email:</strong> ${safeEmail}</p>
              <p><strong>Mensaje:</strong></p>
              <div style="padding:14px;background:#fffafa;border-radius:12px;border:1px solid #f3d5d1;white-space:pre-wrap;">${safeMensaje}</div>
            </div>
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
