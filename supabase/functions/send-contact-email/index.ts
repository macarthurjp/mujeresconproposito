import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { esc, infoTable, messageBlock, renderEmail } from "../_shared/email-layout.ts";
import { getRecipients } from "../_shared/recipients.ts";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

// Internal-only: called by submit-join / submit-contact with the service role key.
function isInternalCall(req: Request) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (!key || token.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i += 1) diff |= key.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  if (!isInternalCall(req)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const payload = await req.json();

    const nombre = String(payload.nombre || "").trim();
    const email = normalizeEmail(payload.email);
    const mensaje = String(payload.mensaje || "").trim();

    if (!nombre) throw new Error("El nombre es obligatorio.");
    if (!email) throw new Error("El correo es obligatorio.");
    if (!mensaje) throw new Error("El mensaje es obligatorio.");

    // Prayer requests come from the "¿Necesitas oración?" entry points.
    const isPrayer = /^\s*🙏|petici[oó]n de oraci[oó]n/i.test(mensaje);
    const cleanMessage = isPrayer ? mensaje.replace(/^\s*🙏\s*Petici[oó]n de oraci[oó]n:?\s*/i, "").trim() || mensaje : mensaje;
    const firstName = nombre.split(/\s+/)[0];

    const providerResponse = await sendEmail({
      to: await getRecipients("contact"),
      replyTo: email,
      subject: isPrayer ? `🙏 Petición de oración de ${nombre}` : `Nuevo mensaje de ${nombre}`,
      text: [
        isPrayer ? "Nueva petición de oración" : "Nuevo mensaje desde el formulario de contacto",
        "",
        `Nombre: ${nombre}`,
        `Email: ${email}`,
        "",
        isPrayer ? "Petición:" : "Mensaje:",
        cleanMessage,
        "",
        "Responde a este correo para escribirle directamente.",
      ].join("\n"),
      html: renderEmail({
        preheader: `${nombre}: ${cleanMessage.slice(0, 90)}`,
        eyebrow: isPrayer ? "Petición de oración" : "Formulario de contacto",
        title: isPrayer ? `${firstName} necesita oración` : `Nuevo mensaje de ${firstName}`,
        intro: isPrayer
          ? "Recibimos una nueva petición de oración desde la web o la app."
          : "Alguien escribió a través del formulario de contacto.",
        body: infoTable([
          { label: "Nombre", value: nombre },
          { label: "Correo", value: `<a href="mailto:${esc(email)}" style="color:#a64b43;text-decoration:none;">${esc(email)}</a>`, html: true },
        ]) + messageBlock(isPrayer ? "Petición" : "Mensaje", cleanMessage),
        actions: [{ label: `Responder a ${firstName}`, url: `mailto:${email}` }],
        footnote: "También puedes responder directamente a este correo.",
        footer: isPrayer ? "Tratemos cada petición con cariño y confidencialidad." : "Notificación privada del formulario de contacto",
      }),
    });

    return jsonResponse({ ok: true, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
