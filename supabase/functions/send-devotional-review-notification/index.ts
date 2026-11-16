import { infoTable, renderEmail } from "../_shared/email-layout.ts";
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
    const { data: canWrite } = await admin.rpc("admin_user_has_permission", { p_user_id: requester.id, p_module: "devotionals", p_action: "create" });
    const { data: canEdit } = await admin.rpc("admin_user_has_permission", { p_user_id: requester.id, p_module: "devotionals", p_action: "edit" });
    const isEditor = canWrite === true || canEdit === true;
    const isSuperAdmin = requesterRole?.is_super_admin === true;
    if (!isSuperAdmin && !(isOwner && isEditor)) {
      return jsonResponse({ ok: false, error: "No tienes permiso para notificar sobre este devocional." }, 403);
    }

    // Reviewers = everyone whose role (or exception) allows publishing devotionals, plus Super Admins.
    const { data: reviewers, error: reviewersError } = await admin
      .rpc("admin_users_with_permission", { p_module: "devotionals", p_action: "publish" });
    if (reviewersError) throw reviewersError;

    const requesterEmail = String(requester.email || "").trim().toLowerCase();
    const recipients = Array.from(new Set(
      ((reviewers || []) as { email: string | null }[])
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
          html: renderEmail({
            preheader: `${autora || "Una editora"} envió “${titulo}” a revisión.`,
            eyebrow: "Flujo editorial",
            title: "Nuevo devocional en revisión",
            intro: `${autora || "Una editora"} envió un devocional para tu revisión.`,
            body: infoTable([
              { label: "Título", value: titulo, accent: true },
              { label: "Autora", value: autora },
            ]),
            actions: [{ label: "Revisar devocional", url: adminUrl }],
            footnote: "Ábrelo en el panel de administración, pestaña Devocionales.",
            footer: "Aviso interno para revisoras",
          }),
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
