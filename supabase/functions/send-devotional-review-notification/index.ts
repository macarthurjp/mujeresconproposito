import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";
import { escapeHtml, sendEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ ok: false, error: "Sesión requerida." }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const requester = userData?.user;
    if (userError || !requester) return jsonResponse({ ok: false, error: "Sesión inválida." }, 401);

    const body = await req.json().catch(() => null);
    const devocionalId = Number(body?.id);
    if (!devocionalId) return jsonResponse({ ok: false, error: "Falta el id del devocional." }, 400);

    const { data: devocional, error: devocionalError } = await admin
      .from("devocionales")
      .select("id,slug,estado,created_by,pending_content")
      .eq("id", devocionalId)
      .maybeSingle();
    if (devocionalError) throw devocionalError;
    if (!devocional) return jsonResponse({ ok: false, error: "Devocional no encontrado." }, 404);
    if (devocional.estado !== "en_revision") {
      return jsonResponse({ ok: false, error: "Este devocional no está en revisión." }, 400);
    }

    const { data: requesterRole } = await admin
      .from("user_roles")
      .select("is_super_admin,permissions,is_revoked")
      .eq("user_id", requester.id)
      .maybeSingle();
    if (requesterRole?.is_revoked) {
      return jsonResponse({ ok: false, error: "Tu acceso fue revocado." }, 403);
    }
    const isOwner = devocional.created_by === requester.id;
    const isEditor = Array.isArray(requesterRole?.permissions) && requesterRole.permissions.includes("editor");
    const isSuperAdmin = requesterRole?.is_super_admin === true;
    if (!isSuperAdmin && !(isOwner && isEditor)) {
      return jsonResponse({ ok: false, error: "No tienes permiso para notificar sobre este devocional." }, 403);
    }

    const { data: reviewers, error: reviewersError } = await admin
      .from("user_roles")
      .select("email")
      .eq("is_revoked", false)
      .or("is_super_admin.eq.true,permissions.cs.{reviewer}");
    if (reviewersError) throw reviewersError;

    const requesterEmail = String(requester.email || "").trim().toLowerCase();
    const recipients = Array.from(new Set(
      (reviewers || [])
        .map((row) => String(row.email || "").trim().toLowerCase())
        .filter(Boolean)
    )).filter((email) => email !== requesterEmail);

    if (!recipients.length) {
      return jsonResponse({ ok: true, notified: 0, warning: "No hay revisores configurados para notificar." });
    }

    const pending = (devocional.pending_content || {}) as Record<string, unknown>;
    const titulo = String(pending.titulo || "Sin título").trim();
    const autora = String(pending.autora || "").trim();
    const adminUrl = "https://mcp930.org/admin.html";
    const safeTitulo = escapeHtml(titulo);
    const safeAutora = escapeHtml(autora || "Un editor");
    const subjectTitulo = titulo.replace(/[\r\n]+/g, " ").slice(0, 150);

    const results = await Promise.allSettled(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `Nuevo devocional en revisión: ${subjectTitulo}`,
          text: [
            `${autora || "Un editor"} envió un devocional a revisión.`,
            "",
            `Título: ${titulo}`,
            "",
            `Revísalo aquí: ${adminUrl}`,
          ].join("\n"),
          html: `
            <!doctype html>
            <html lang="es">
              <body style="margin:0;padding:0;background-color:#f8f4f3;color:#354052;font-family:Arial,Helvetica,sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f4f3;">
                  <tr>
                    <td align="center" style="padding:38px 16px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #ecd8d4;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(105,65,60,0.08);">
                        <tr>
                          <td align="center" style="padding:40px 32px 34px;background:linear-gradient(135deg,#fffaf8 0%,#fff4f2 100%);border-bottom:1px solid #f0ddda;">
                            <div style="margin:0 0 14px;color:#ad7671;font-size:13px;font-weight:800;letter-spacing:3px;text-transform:uppercase;">Mujeres con Propósito</div>
                            <h1 style="margin:0;color:#b55d5e;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;">Nuevo devocional en revisión</h1>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:32px 32px 36px;">
                            <p style="margin:0 0 10px;color:#354052;font-size:16px;line-height:1.6;"><strong>${safeAutora}</strong> envió un devocional para tu revisión:</p>
                            <p style="margin:0 0 26px;padding:16px 18px;background:#fff8f6;border:1px solid #efdcda;border-left:4px solid #e7a39a;border-radius:12px;color:#293241;font-size:17px;font-weight:800;">${safeTitulo}</p>
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                              <tr>
                                <td align="center" bgcolor="#8f4547" style="border-radius:999px;">
                                  <a href="${adminUrl}" target="_blank" style="display:inline-block;padding:15px 28px;color:#ffffff;font-size:16px;font-weight:800;text-decoration:none;border-radius:999px;">Ir a revisarlo</a>
                                </td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                        <tr>
                          <td align="center" style="padding:20px 30px;background:#8f4547;color:#ffffff;">
                            <p style="margin:0;font-size:13px;">Mujeres con Propósito · Flujo editorial</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </body>
            </html>
          `,
        })
      )
    );

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length) {
      console.error("send-devotional-review-notification: fallos parciales", failed);
    }

    return jsonResponse({ ok: true, notified: recipients.length - failed.length, failed: failed.length });
  } catch (error) {
    console.error("send-devotional-review-notification", error);
    return jsonResponse({
      ok: false,
      error: error instanceof Error ? error.message : "No se pudo notificar a los revisores."
    }, 500);
  }
});
