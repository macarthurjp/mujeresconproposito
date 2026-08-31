import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders, jsonResponse, requiredEnv } from "../_shared/http.ts";

const ASSIGNABLE_ROLES = new Set(["crud", "read_export", "read_only"]);

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
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
      .select("role")
      .eq("user_id", requester.id)
      .maybeSingle();
    if (requesterRole?.role !== "crud") {
      return jsonResponse({ ok: false, error: "Solo el Super Admin puede gestionar usuarios." }, 403);
    }

    const body = await req.json();
    const action = String(body.action || "list");

    if (action === "list") {
      const { data: authData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw listError;
      const { data: roles, error: rolesError } = await admin.from("user_roles").select("user_id,email,role,created_at");
      if (rolesError) throw rolesError;
      const rolesByUser = new Map((roles || []).map((entry) => [entry.user_id, entry]));
      const users = (authData?.users || []).map((user) => {
        const access = rolesByUser.get(user.id);
        return {
          userId: user.id,
          email: user.email || access?.email || "",
          role: access?.role || "read_only",
          createdAt: user.created_at,
          lastSignInAt: user.last_sign_in_at,
          isCurrentUser: user.id === requester.id
        };
      });
      return jsonResponse({ ok: true, users });
    }

    if (action === "invite") {
      const email = normalizeEmail(body.email);
      const role = String(body.role || "read_only");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ ok: false, error: "Escribe un correo válido." }, 400);
      }
      if (!ASSIGNABLE_ROLES.has(role)) return jsonResponse({ ok: false, error: "Rol inválido." }, 400);

      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: "https://mcp930.org/reset-password.html"
      });
      if (error) return jsonResponse({ ok: false, error: error.message }, 400);
      const userId = data.user?.id;
      if (!userId) throw new Error("Supabase no devolvió el usuario invitado.");
      const { error: roleError } = await admin.from("user_roles").upsert({
        user_id: userId,
        email,
        role,
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

    if (action === "set_role" || action === "restore") {
      const role = String(body.role || "read_only");
      if (!ASSIGNABLE_ROLES.has(role)) return jsonResponse({ ok: false, error: "Rol inválido." }, 400);
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (authError) throw authError;
      const { error } = await admin.from("user_roles").update({ role, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
      return jsonResponse({ ok: true, message: action === "restore" ? "Acceso restaurado." : "Rol actualizado." });
    }

    if (action === "revoke") {
      const { error: roleError } = await admin.from("user_roles").update({
        role: "revoked",
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
