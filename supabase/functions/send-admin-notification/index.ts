import { esc, formatDateEs, infoTable, messageBlock, renderEmail } from "../_shared/email-layout.ts";
import { getRecipients } from "../_shared/recipients.ts";

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

    const recipients = await getRecipients("join", comunidad);
    const fullName = [nombre, apellido].filter(Boolean).join(" ") || "Nuevo registro";
    const dashboardUrl = "https://mcp930.org/dashboard.html";
    const firstName = nombre || fullName.split(" ")[0];
    const rows = [
      { label: "Nombre", value: fullName },
      { label: "Correo", value: email ? `<a href="mailto:${esc(email)}" style="color:#a64b43;text-decoration:none;">${esc(email)}</a>` : "", html: true },
      { label: "Teléfono", value: telefono },
      { label: "Comunidad", value: comunidad, accent: true },
      { label: "Fecha de nacimiento", value: fechaNacimiento ? formatDateEs(fechaNacimiento) : "" },
      { label: "País de residencia", value: paisResidencia },
      { label: "País de nacimiento", value: paisNacimiento },
      { label: "Estado civil", value: estatusMatrimonial },
      { label: "Hijos", value: hijos && hijos !== "0" ? hijos : "" },
      { label: "Cristiana", value: cristiana },
    ];

    const providerResponse = await sendEmail({
      to: recipients,
      subject: `Nuevo registro${comunidad ? ` · ${comunidad}` : ""}: ${fullName}`,
      replyTo: email || undefined,
      text: [
        "Nuevo registro en la comunidad",
        "",
        ...rows.filter((r) => r.value).map((r) => `${r.label}: ${r.html ? email : r.value}`),
        comments ? `\nComentarios:\n${comments}` : "",
        "",
        `Dashboard: ${dashboardUrl}`,
      ].join("\n"),
      html: renderEmail({
        preheader: `${fullName}${comunidad ? ` quiere unirse a la comunidad de ${comunidad}` : " quiere unirse a la comunidad"}.`,
        eyebrow: comunidad ? `Nuevo registro · ${comunidad}` : "Nuevo registro",
        title: `${firstName} quiere unirse`,
        intro: "Una nueva hermana completó el formulario Únete. Estos son sus datos.",
        body: infoTable(rows) + (comments ? messageBlock("Comentarios", comments) : ""),
        actions: [
          ...(email ? [{ label: `Escribir a ${firstName}`, url: `mailto:${email}` }] : []),
          { label: "Abrir dashboard", url: dashboardUrl, variant: "secondary" as const },
        ],
        footnote: "Responde a este correo para escribirle directamente.",
        footer: "Notificación privada de registro",
      }),
    });

    return jsonResponse({ ok: true, sentTo: recipients, providerResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error(error);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
