/* Role-based access for the web admin panel (same permissions as the app).
 * The database enforces every rule; this file only adapts what each person sees:
 * tabs, "new" buttons, edit/delete/visibility actions and drag-to-reorder. */
(function () {
  "use strict";

  let allowed = new Set();
  let superAdmin = false;

  const can = (module, action) => superAdmin || allowed.has(`${module}.${action}`);

  // Tab → permission needed to see it. "super" = Super Admin only.
  const TAB_RULES = {
    eventos: ["events", "view"],
    destacadas: ["content", "view"],
    youtube: ["content", "view"],
    banner: ["content", "edit"],
    galeria: ["gallery", "view"],
    devocionales: ["devotionals", "view"],
    inscripciones: ["content", "edit"],
    avisos: ["notices", "view"],
    seguimiento: ["dashboard", "followup"],
    estadisticas: ["dashboard", "followup"],
    roles: "super",
    permisos: "super",
    correos: "super",
  };
  const tabAllowed = (tab) => {
    const rule = TAB_RULES[tab];
    if (!rule) return superAdmin;
    if (rule === "super") return superAdmin;
    return can(rule[0], rule[1]);
  };

  // List container → module, and how each list action maps to a permission.
  const LISTS = {
    adminEventosList: "events",
    adminDestacadasList: "content",
    adminYoutubeList: "content",
    adminGaleriaList: "gallery",
  };
  const actionFor = (module, action) => {
    if (action === "delete") return "delete";
    if (action === "toggle") return module === "content" ? "publish" : "edit";
    return "edit"; // edit, portada, reorder
  };

  function applyBodyFlags() {
    const flags = [
      ["events", ["create", "edit", "delete"]],
      ["content", ["create", "edit", "delete", "publish"]],
      ["gallery", ["add", "edit", "delete"]],
      ["notices", ["send"]],
    ];
    flags.forEach(([module, actions]) => actions.forEach((action) => {
      document.body.classList.toggle(`perm-no-${module}-${action}`, !can(module, action));
    }));
  }

  function denied(message) {
    window.showAdminToast?.("error", "Sin permiso", message || "Tu rol no permite esta acción.");
  }

  // Block actions the role does not allow, before any other handler runs.
  document.addEventListener("click", (event) => {
    if (superAdmin) return;
    const button = event.target.closest("[data-admin-action]");
    if (!button) return;
    const list = button.closest(Object.keys(LISTS).map((id) => `#${id}`).join(","));
    if (!list) return;
    const module = LISTS[list.id];
    if (!can(module, actionFor(module, button.dataset.adminAction))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      denied();
    }
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (superAdmin || !event.target.closest(".admin-drag-handle")) return;
    const list = event.target.closest(Object.keys(LISTS).map((id) => `#${id}`).join(","));
    if (list && !can(LISTS[list.id], "edit")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  async function load(client, access) {
    superAdmin = Boolean(access?.is_super_admin);
    allowed = new Set();
    if (!superAdmin) {
      const { data, error } = await client.rpc("admin_current_module_permissions");
      if (error) throw new Error("No se pudieron leer tus permisos.");
      (data || []).filter((row) => row.allowed).forEach((row) => allowed.add(row.permission_key));
    }
    let roleName = null;
    if (!superAdmin) {
      const { data: userData } = await client.auth.getUser();
      const uid = userData?.user?.id;
      if (uid) {
        const { data: assignment } = await client.from("admin_role_assignments").select("admin_roles(name)").eq("user_id", uid).maybeSingle();
        const role = assignment?.admin_roles;
        roleName = (Array.isArray(role) ? role[0]?.name : role?.name) || null;
      }
    }
    return { roleName, modulePermissions: Array.from(allowed) };
  }

  /** Shows only the tabs this person may use and activates the first one. */
  function applyTabs() {
    applyBodyFlags();
    const tabs = Array.from(document.querySelectorAll(".admin-tab[data-admin-tab]"));
    tabs.forEach((tab) => { tab.hidden = !tabAllowed(tab.dataset.adminTab); });
    const active = tabs.find((tab) => tab.classList.contains("active") && !tab.hidden) || tabs.find((tab) => !tab.hidden);
    tabs.forEach((tab) => tab.classList.toggle("active", tab === active));
    document.querySelectorAll(".admin-tab-panel").forEach((panel) => {
      panel.classList.toggle("active", Boolean(active) && panel.id === `admin-${active.dataset.adminTab}`);
    });
    if (!superAdmin) {
      document.getElementById("adminStatsGrid")?.setAttribute("hidden", "");
      document.getElementById("adminShareJoinLink")?.setAttribute("hidden", "");
    }
  }

  const hasAdminModule = () => superAdmin || ["events", "gallery", "content", "devotionals", "notices"].some((m) => can(m, "view")) || can("dashboard", "followup");

  window.McpAdminPerms = { load, can, applyTabs, hasAdminModule, tabAllowed, isSuperAdmin: () => superAdmin };
})();
