import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";

const ASSIGNABLE_PERMISSIONS = new Set(["editor", "read_export", "reviewer"]);

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function parsePermissions(value: unknown): string[] | null {
  const requested = Array.isArray(value) ? value : [];
  if (!requested.every((p) => typeof p === "string" && ASSIGNABLE_PERMISSIONS.has(p))) return null;
  return Array.from(new Set<string>(["read_only", ...requested]));
}

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

    const { data: requesterRole } = await admin
      .from("user_roles")
      .select("is_super_admin")
      .eq("user_id", requester.id)
      .maybeSingle();
    if (requesterRole?.is_super_admin !== true) {
      return jsonResponse({ ok: false, error: "Solo el Super Admin puede gestionar usuarios." }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "list");

    if (action === "list") {
      const { data: authData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const { data: roles, error: rolesError } = await admin.from("user_roles").select("user_id,email,is_super_admin,permissions,is_revoked,created_at");
      if (rolesError) throw rolesError;
      const rolesByUser = new Map((roles || []).map((entry) => [entry.user_id, entry]));
      const users = (authData?.users || []).map((user) => {
        const access = rolesByUser.get(user.id);
        return {
          userId: user.id,
          email: user.email || access?.email || "",
          isSuperAdmin: access?.is_super_admin ?? false,
          permissions: access?.permissions ?? ["read_only"],
          isRevoked: access?.is_revoked ?? false,
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          isCurrentUser: user.id === requester.id
        };
      });
      return jsonResponse({ ok: true, users });
    }

    if (action === "invite") {
      const email = normalizeEmail(body.email);
      const isSuperAdmin = Boolean(body.isSuperAdmin);
      const permissions = parsePermissions(body.permissions);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ ok: false, error: "Escribe un correo válido." }, 400);
      }
      if (!permissions) return jsonResponse({ ok: false, error: "Permisos inválidos." }, 400);

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://mcp930.org/reset-password.html"
      });
      if (error) return jsonResponse({ ok: false, error: error.message }, 400);
      const userId = data.user?.id;
      if (!userId) throw new Error("Supabase no devolvió el usuario invitado.");
      const { error: roleError } = await admin.from("user_roles").upsert({
        user_id: userId,
        email,
        is_super_admin: isSuperAdmin,
        permissions,
        updated_at: new Date().toISOString()
      });
      if (roleError) throw roleError;
      return jsonResponse({ ok: true, message: "Invitación enviada." });
    }

    if (action === "change_my_email") {
      const email = normalizeEmail(body.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ ok: false, error: "Escribe un correo válido." }, 400);
      }
      const { error: authError } = await admin.auth.admin.updateUserById(requester.id, {
        email,
        email_confirm: true
      });
      if (authError) return jsonResponse({ ok: false, error: authError.message }, 400);
      const { error: roleError } = await admin.from("user_roles").update({
        email,
        updated_at: new Date().toISOString()
      }).eq("user_id", requester.id);
      if (roleError) throw roleError;
      return jsonResponse({ ok: true, message: "Correo del Super Admin actualizado." });
    }

    const userId = String(body.userId || "");
    if (!userId) return jsonResponse({ ok: false, error: "Usuario requerido." }, 400);

    if (action === "send_password_reset") {
      const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(userId);
      const email = normalizeEmail(targetData?.user?.email);
      if (targetError || !email) {
        return jsonResponse({ ok: false, error: "No se encontró el correo de esta cuenta." }, 404);
      }
      const { error: resetError } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: "https://mcp930.org/reset-password.html"
      });
      if (resetError) return jsonResponse({ ok: false, error: resetError.message }, 400);
      return jsonResponse({ ok: true, message: "Enlace de restablecimiento enviado." });
    }

    if (userId === requester.id) return jsonResponse({ ok: false, error: "No puedes modificar ni revocar tu propia cuenta." }, 400);

    if (action === "set_role") {
      const isSuperAdmin = Boolean(body.isSuperAdmin);
      const permissions = parsePermissions(body.permissions);
      if (!permissions) return jsonResponse({ ok: false, error: "Permisos inválidos." }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (authError) throw authError;
      const { error } = await admin.from("user_roles").update({
        is_super_admin: isSuperAdmin,
        permissions,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (error) throw error;
      return jsonResponse({ ok: true, message: "Rol actualizado." });
    }

    if (action === "restore") {
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (authError) throw authError;
      const { error } = await admin.from("user_roles").update({
        is_revoked: false,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (error) throw error;
      return jsonResponse({ ok: true, message: "Acceso restaurado." });
    }

    if (action === "revoke") {
      const { error: roleError } = await admin.from("user_roles").update({
        is_revoked: true,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (roleError) throw roleError;
      const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (banError) throw banError;
      return jsonResponse({ ok: true, message: "Acceso revocado." });
    }

    return jsonResponse({ ok: false, error: "Acción inválida." }, 400);
  } catch (error) {
    console.error("manage-users", error);
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : "No se pudo gestionar el usuario." }, 500);
  }
});
