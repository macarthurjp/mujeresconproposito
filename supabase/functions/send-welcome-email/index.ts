import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { sendEmail } from "../_shared/email.ts";
import { esc, paragraph, quoteBlock, renderEmail } from "../_shared/email-layout.ts";

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  if (!isInternalCall(req)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    const payload = await req.json();
    const email = String(payload.email || "").trim();
    const nombre = String(payload.nombre || "").trim() || "amada";
    const comunidad = String(payload.comunidad || "").trim();

    if (!email) {
      return jsonResponse({ ok: false, error: "Missing email" }, 400);
    }

    const siteUrl = "https://mcp930.org/";

    const providerResponse = await sendEmail({
      to: email,
      subject: `${nombre}, bienvenida a Mujeres con Propósito`,
      text: [
        `¡Bienvenida, ${nombre}!`,
        "",
        "Nos alegra mucho que ahora formes parte de esta comunidad de fe, crecimiento y propósito.",
        comunidad ? `Recibimos tu solicitud para la comunidad de ${comunidad}.` : "Recibimos tu solicitud correctamente.",
        "Muy pronto una de nuestras líderes se pondrá en contacto contigo.",
        "",
        "“El Señor cumplirá en mí su propósito.” — Salmo 138:8",
        "",
        siteUrl,
      ].join("\n"),
      html: renderEmail({
        preheader: "Nos alegra mucho que formes parte de esta comunidad de fe, crecimiento y propósito.",
        eyebrow: "Bienvenida",
        title: `¡Bienvenida, ${nombre}!`,
        intro: "Nos alegra mucho que ahora formes parte de esta comunidad de fe, crecimiento y propósito.",
        body: paragraph(comunidad
          ? `Recibimos tu solicitud para la comunidad de <strong style="color:#a64b43;">${esc(comunidad)}</strong>. Muy pronto una de nuestras líderes se pondrá en contacto contigo.`
          : "Recibimos tu solicitud correctamente. Muy pronto una de nuestras líderes se pondrá en contacto contigo.")
          + paragraph("Oramos para que este sea un tiempo de crecimiento, fe, bendición y propósito para tu vida.")
          + quoteBlock("El Señor cumplirá en mí su propósito.", "Salmo 138:8"),
        actions: [{ label: "Visitar la comunidad", url: siteUrl }],
        footnote: "Descarga también nuestra app para recibir avisos de las reuniones.",
      }),
    });

    return jsonResponse({ ok: true, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
