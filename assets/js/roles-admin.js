/* Roles y permisos (web, Super Admin only) — same flow as the app:
 * 1) search people (3+ letters), select several; 2) "Asignar rol": pick a role,
 * review/adjust its permissions, save; plus people with a role, roles list and
 * individual exceptions. All rules are enforced by the database. */
(function () {
  "use strict";

  const MODULES = [
    { key: "events", label: "Eventos y reuniones", perms: [["view", "Visualizar"], ["create", "Crear"], ["edit", "Editar"], ["delete", "Eliminar"]] },
    { key: "devotionals", label: "Devocionales", perms: [["view", "Visualizar"], ["create", "Crear"], ["edit", "Editar"], ["delete", "Eliminar"], ["publish", "Publicar"]] },
    { key: "gallery", label: "Galería de fotos", perms: [["view", "Visualizar imágenes"], ["add", "Agregar imágenes"], ["edit", "Modificar imágenes"], ["delete", "Eliminar imágenes"]] },
    { key: "content", label: "Contenidos y publicaciones", perms: [["view", "Visualizar"], ["create", "Crear"], ["edit", "Editar"], ["delete", "Eliminar"], ["publish", "Publicar"]] },
    { key: "notices", label: "Enviar aviso", perms: [["view", "Acceder al módulo"], ["send", "Enviar avisos"]] },
    { key: "dashboard", label: "Dashboard", perms: [["view", "Visualizar"], ["contacts", "Ver contactos y exportar"], ["followup", "Seguimiento y estadísticas"]] },
  ];
  const CATALOG = MODULES.flatMap((m) => m.perms.map(([a, label]) => ({ key: `${m.key}.${a}`, module: m.key, action: a, label })));
  const SENSITIVE = new Set(["delete", "publish", "send", "contacts", "followup"]);
  const PRESETS = [["Nada", []], ["Solo lectura", ["view"]], ["Editor", ["view", "create", "add", "edit"]], ["Todo", null]];

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const client = () => window.McpSupabase?.getSupabaseBrowserClient?.() || window.getAdminSupabaseClient?.();
  const toast = (type, title, msg) => window.showAdminToast?.(type, title, msg);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const actionOf = (key) => key.split(".")[1];

  const state = { users: [], roles: [], perms: {}, assignments: [], picked: [], ready: false };
  let sheet = null; // { kind: 'assign' | 'role' | 'overrides', ... }

  async function rpc(name, args) {
    const { data, error } = await client().rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async function refresh() {
    const c = client();
    const [{ data: users, error: ue }, roles, rp, asg] = await Promise.all([
      c.functions.invoke("manage-users", { body: { action: "list" } }),
      c.from("admin_roles").select("id,name,description,view_only").order("name"),
      c.from("admin_role_permissions").select("role_id,permission_key"),
      c.from("admin_role_assignments").select("user_id,role_id"),
    ]);
    if (ue) throw new Error(ue.message);
    [roles, rp, asg].forEach((r) => { if (r.error) throw new Error(r.error.message); });
    state.users = (users?.users || []).filter((u) => !u.isSuperAdmin && !u.isRevoked);
    state.roles = roles.data || [];
    state.perms = {};
    (rp.data || []).forEach((row) => { (state.perms[row.role_id] ||= []).push(row.permission_key); });
    state.assignments = asg.data || [];
    state.ready = true;
    render();
  }
  const roleOf = (userId) => {
    const a = state.assignments.find((x) => x.user_id === userId);
    return a ? state.roles.find((r) => r.id === a.role_id) || null : null;
  };
  const userById = (id) => state.users.find((u) => u.userId === id);

  // ---------- Main panel ----------
  function render() {
    const root = $("rpRoot");
    if (!root || !state.ready) return;
    const q = ($("rpSearch")?.value || "").trim().toLocaleLowerCase("es");
    const results = q.length >= 3 ? state.users.filter((u) => `${u.nombre} ${u.email}`.toLocaleLowerCase("es").includes(q)).slice(0, 8) : [];
    const picked = state.picked.map(userById).filter(Boolean);
    const withRole = state.users.filter((u) => roleOf(u.userId))
      .sort((a, b) => (roleOf(a.userId)?.name || "").localeCompare(roleOf(b.userId)?.name || "", "es") || a.email.localeCompare(b.email));

    $("rpResults").innerHTML = q.length > 0 && q.length < 3 ? '<p class="rp-hint">Escribe al menos 3 letras.</p>'
      : q.length >= 3 && !results.length ? '<p class="rp-hint">No hay cuentas con ese nombre o correo. Invítala primero en Usuarios y roles.</p>'
      : results.map((u) => {
        const on = state.picked.includes(u.userId); const r = roleOf(u.userId);
        return `<button type="button" class="rp-person${on ? " is-on" : ""}" data-rp-pick="${esc(u.userId)}" aria-pressed="${on}">
          <span class="rp-avatar">${esc((u.nombre || u.email).charAt(0).toUpperCase())}</span>
          <span class="rp-person-text"><strong>${esc(u.nombre || "Sin nombre")}</strong><span>${esc(u.email)}</span><em>${r ? `Rol actual: ${esc(r.name)}` : "Sin rol"}</em></span>
          <i class="fa-${on ? "solid fa-circle-check" : "regular fa-circle"} rp-check" aria-hidden="true"></i></button>`;
      }).join("");
    $("rpChips").innerHTML = picked.map((u) => `<button type="button" class="rp-chip" data-rp-pick="${esc(u.userId)}">${esc(u.nombre || u.email)} <i class="fa-solid fa-xmark"></i></button>`).join("");
    const btn = $("rpAssignBtn");
    btn.disabled = !picked.length;
    btn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${picked.length ? `Asignar rol a ${plural(picked.length, "persona", "personas")}` : "Selecciona personas para asignar"}`;

    $("rpWithRoleCount").textContent = withRole.length;
    $("rpWithRole").innerHTML = withRole.length ? withRole.map((u) => {
      const r = roleOf(u.userId);
      return `<div class="rp-assigned">
        <span class="rp-avatar">${esc((u.nombre || u.email).charAt(0).toUpperCase())}</span>
        <span class="rp-person-text"><strong>${esc(u.nombre || "Sin nombre")}</strong><span>${esc(u.email)}</span></span>
        <span class="rp-role-pill${r.view_only ? " is-read" : ""}">${esc(r.name)}</span>
        <span class="rp-actions">
          <button type="button" data-rp-change="${esc(u.userId)}"><i class="fa-solid fa-right-left"></i> Cambiar rol</button>
          <button type="button" data-rp-overrides="${esc(u.userId)}"><i class="fa-solid fa-sliders"></i> Excepciones</button>
          <button type="button" class="danger" data-rp-remove="${esc(u.userId)}"><i class="fa-regular fa-circle-xmark"></i> Quitar</button>
        </span></div>`;
    }).join("") : '<div class="admin-empty">Todavía nadie tiene un rol asignado.</div>';

    $("rpRoles").innerHTML = state.roles.map((r) => {
      const n = state.assignments.filter((a) => a.role_id === r.id).length; const p = (state.perms[r.id] || []).length;
      return `<button type="button" class="rp-role-row" data-rp-role="${esc(r.id)}">
        <span class="rp-role-icon"><i class="fa-solid ${r.view_only ? "fa-eye" : "fa-shield-halved"}"></i></span>
        <span class="rp-person-text"><strong>${esc(r.name)}</strong><span>${plural(n, "persona", "personas")} · ${p ? plural(p, "permiso", "permisos") : "sin configurar"}${r.view_only ? " · solo lectura" : ""}</span></span>
        <i class="fa-solid fa-chevron-right rp-chev"></i></button>`;
    }).join("");
  }

  // ---------- Permission editor (inside sheets) ----------
  function editorHtml(viewOnly, value) {
    const summary = MODULES.map((m) => ({ label: m.label, acts: m.perms.filter(([a]) => value.includes(`${m.key}.${a}`)).map(([, l]) => l.toLowerCase()) })).filter((x) => x.acts.length);
    return `${viewOnly ? '<div class="rp-note"><i class="fa-solid fa-lock"></i> Rol de solo lectura: solo admite permisos de visualizar. Nadie con este rol puede crear, editar, eliminar, publicar ni enviar avisos.</div>' : ""}
      <div class="rp-summary"><span class="rp-summary-title">Este rol puede</span>${summary.length
        ? summary.map((x) => `<div class="rp-summary-line"><i class="fa-solid fa-circle-check"></i><span><strong>${esc(x.label)}:</strong> ${esc(x.acts.join(", "))}</span></div>`).join("")
        : '<p class="rp-hint" style="margin:0">Todavía no tiene permisos. Elige una opción rápida o activa los permisos abajo.</p>'}</div>
      <p class="rp-mini">Opciones rápidas</p>
      <div class="rp-presets">${PRESETS.filter(([, acts]) => !viewOnly || (acts && acts.every((a) => a === "view"))).map(([label], i) => `<button type="button" data-rp-preset="${i}">${label}</button>`).join("")}</div>
      ${MODULES.map((m) => `<div class="rp-module"><h4>${esc(m.label)}</h4>${m.perms.filter(([a]) => !viewOnly || a === "view").map(([a, label]) => {
        const key = `${m.key}.${a}`;
        return `<label class="rp-toggle"><span>${esc(label)}${SENSITIVE.has(a) ? '<small>Permiso importante</small>' : ""}</span><input type="checkbox" data-rp-perm="${key}" ${value.includes(key) ? "checked" : ""}></label>`;
      }).join("")}</div>`).join("")}`;
  }
  function readEditor(box) {
    return Array.from(box.querySelectorAll("[data-rp-perm]")).filter((i) => i.checked).map((i) => i.dataset.rpPerm);
  }

  function openSheet(html, onSave, saveLabel = "Guardar") {
    $("rpSheetBody").innerHTML = html;
    $("rpSheetSave").textContent = saveLabel;
    $("rpSheet").hidden = false;
    document.body.classList.add("rp-sheet-open");
    sheet = { onSave };
  }
  function closeSheet() { $("rpSheet").hidden = true; document.body.classList.remove("rp-sheet-open"); sheet = null; }

  function confirmSensitive(role, next) {
    const before = state.perms[role.id] || [];
    const risky = CATALOG.filter((p) => next.includes(p.key) && SENSITIVE.has(p.action) && !before.includes(p.key));
    if (!risky.length) return true;
    const lines = risky.map((p) => `• ${MODULES.find((m) => m.key === p.module).label}: ${p.label.toLowerCase()}`).join("\n");
    return window.confirm(`Las personas con el rol «${role.name}» podrán:\n${lines}\n\n¿Continuar?`);
  }

  // Assign flow
  function openAssign(ids) {
    if (ids) state.picked = ids;
    const people = state.picked.map(userById).filter(Boolean);
    let role = people.map((u) => roleOf(u.userId)).find(Boolean) || null;
    const draw = () => {
      const value = role ? (sheet?.draft ?? (state.perms[role.id] || [])) : [];
      $("rpSheetBody").innerHTML = `<p class="rp-mini">Para</p><div class="rp-chips">${people.map((u) => `<span class="rp-chip is-static">${esc(u.nombre || u.email)}</span>`).join("")}</div>
        <p class="rp-mini" style="margin-top:16px">Elige un rol</p>
        <div class="rp-card">${state.roles.map((r) => `<label class="rp-radio"><input type="radio" name="rpRole" value="${esc(r.id)}" ${role?.id === r.id ? "checked" : ""}>
          <span class="rp-person-text"><strong>${esc(r.name)}</strong><span>${(state.perms[r.id] || []).length ? plural((state.perms[r.id] || []).length, "permiso", "permisos") : "Sin configurar"}${r.view_only ? " · solo lectura" : ""}</span></span></label>`).join("")}</div>
        ${role ? `<p class="rp-mini" style="margin-top:16px">Permisos de ${esc(role.name)}</p><p class="rp-hint">Los cambios se aplican a todas las personas con el rol ${esc(role.name)}.</p><div id="rpEditor">${editorHtml(Boolean(role.view_only), value)}</div>` : '<p class="rp-hint">Elige un rol para ver y ajustar sus permisos.</p>'}`;
    };
    openSheet("", async () => {
      if (!role) return toast("error", "Elige un rol", "Selecciona el rol que quieres asignar.");
      const next = readEditor($("rpSheetBody"));
      if (!next.length && !window.confirm(`«${role.name}» no tiene ningún permiso: estas personas no verán ningún módulo. ¿Asignarlo igualmente?`)) return;
      if (!confirmSensitive(role, next)) return;
      const before = state.perms[role.id] || [];
      if (next.length !== before.length || next.some((k) => !before.includes(k))) await rpc("admin_save_role_permissions", { p_role_id: role.id, p_permissions: next });
      for (const u of people) await rpc("admin_assign_role", { p_email: u.email, p_role_id: role.id });
      closeSheet(); state.picked = []; if ($("rpSearch")) $("rpSearch").value = "";
      await refresh();
      toast("success", "Rol asignado", `${role.name} asignado a ${plural(people.length, "persona", "personas")}.`);
    });
    $("rpSheetTitle").textContent = "Asignar rol";
    draw();
    sheet.redraw = (newRoleId) => { role = state.roles.find((r) => r.id === newRoleId) || null; sheet.draft = null; draw(); };
  }

  function openRole(roleId) {
    const role = roleId ? state.roles.find((r) => r.id === roleId) : null;
    openSheet(`<p class="rp-mini">Nombre</p><input class="rp-input" id="rpRoleName" maxlength="80" value="${esc(role?.name || "")}" placeholder="Ej. Coordinadora Europa">
      <p class="rp-mini" style="margin-top:12px">Descripción</p><textarea class="rp-input" id="rpRoleDesc" maxlength="300" rows="3" placeholder="Para qué sirve este rol">${esc(role?.description || "")}</textarea>
      <p class="rp-mini" style="margin-top:16px">Permisos</p><div id="rpEditor">${editorHtml(Boolean(role?.view_only), role ? state.perms[role.id] || [] : [])}</div>`, async () => {
      const name = $("rpRoleName").value.trim();
      if (!name) return toast("error", "Falta el nombre", "Escribe un nombre para el rol.");
      const next = readEditor($("rpSheetBody"));
      if (role && !confirmSensitive(role, next)) return;
      const id = await rpc("admin_save_role", { p_name: name, p_description: $("rpRoleDesc").value.trim(), p_role_id: role?.id || null });
      await rpc("admin_save_role_permissions", { p_role_id: id, p_permissions: next });
      closeSheet(); await refresh();
      toast("success", "Rol guardado", name);
    });
    $("rpSheetTitle").textContent = role ? "Editar rol" : "Nuevo rol";
  }

  async function openOverrides(userId) {
    const u = userById(userId); const role = roleOf(userId);
    if (!u || !role) return;
    const { data, error } = await client().from("admin_user_permission_overrides").select("permission_key,allowed").eq("user_id", userId);
    if (error) return toast("error", "No se pudieron leer las excepciones", error.message);
    const state2 = Object.fromEntries(CATALOG.map((p) => [p.key, null]));
    (data || []).forEach((row) => { state2[row.permission_key] = row.allowed; });
    const inherited = state.perms[role.id] || [];
    const draw = () => {
      $("rpSheetBody").innerHTML = `<div class="rp-person-text"><strong>${esc(u.nombre || "Sin nombre")}</strong><span>${esc(u.email)} · ${esc(role.name)}</span></div>
        <p class="rp-hint" style="margin-top:10px">Toca un permiso para cambiarlo solo para esta persona: Heredar (lo que diga su rol) → Permitir → Denegar.${role.view_only ? " Su rol es de solo lectura: solo puedes ajustar qué puede ver." : ""}</p>
        ${MODULES.map((m) => `<div class="rp-module"><h4>${esc(m.label)}</h4>${m.perms.filter(([a]) => !role.view_only || a === "view").map(([a, label]) => {
          const key = `${m.key}.${a}`; const v = state2[key]; const eff = v === null ? inherited.includes(key) : v;
          return `<button type="button" class="rp-override" data-rp-cycle="${key}"><span><span class="rp-ov-label">${esc(label)}</span><small>${eff ? "Puede hacerlo" : "Sin acceso"}</small></span>
            <span class="rp-state ${v === true ? "is-allow" : v === false ? "is-deny" : ""}">${v === null ? "Heredar" : v ? "Permitir" : "Denegar"}</span></button>`;
        }).join("")}</div>`).join("")}`;
    };
    openSheet("", async () => {
      const explicit = Object.fromEntries(Object.entries(state2).filter(([, v]) => v !== null));
      await rpc("admin_save_user_overrides", { p_user_id: userId, p_overrides: explicit });
      closeSheet(); toast("success", "Excepciones guardadas", u.nombre || u.email);
    });
    $("rpSheetTitle").textContent = "Excepciones";
    sheet.cycle = (key) => {
      const cur = state2[key]; const canAllow = !role.view_only || actionOf(key) === "view";
      state2[key] = cur === null ? (inherited.includes(key) ? false : canAllow ? true : false) : cur === true ? false : null;
      draw();
    };
    draw();
  }

  function wire() {
    $("rpSearch").addEventListener("input", render);
    $("rpAssignBtn").addEventListener("click", () => openAssign());
    $("rpNewRole").addEventListener("click", () => openRole(null));
    $("rpSheetCancel").addEventListener("click", closeSheet);
    $("rpSheet").addEventListener("click", (e) => { if (e.target.id === "rpSheet") closeSheet(); });
    $("rpSheetSave").addEventListener("click", async (e) => {
      if (!sheet) return;
      e.currentTarget.disabled = true;
      try { await sheet.onSave(); } catch (err) { toast("error", "No se pudo guardar", err.message); }
      finally { e.currentTarget.disabled = false; }
    });
    $("rpRoot").addEventListener("click", async (e) => {
      const pick = e.target.closest("[data-rp-pick]");
      if (pick) { const id = pick.dataset.rpPick; state.picked = state.picked.includes(id) ? state.picked.filter((x) => x !== id) : [...state.picked, id]; return render(); }
      const change = e.target.closest("[data-rp-change]"); if (change) return openAssign([change.dataset.rpChange]);
      const ov = e.target.closest("[data-rp-overrides]"); if (ov) return openOverrides(ov.dataset.rpOverrides);
      const rm = e.target.closest("[data-rp-remove]");
      if (rm) {
        const u = userById(rm.dataset.rpRemove); const r = roleOf(rm.dataset.rpRemove);
        if (!window.confirm(`¿Quitar el rol ${r?.name || ""} a ${u?.nombre || u?.email}? Dejará de ver los módulos del panel.`)) return;
        try { await rpc("admin_remove_role_assignment", { p_user_id: rm.dataset.rpRemove }); await refresh(); toast("success", "Rol quitado", u?.nombre || u?.email || ""); }
        catch (err) { toast("error", "No se pudo quitar", err.message); }
        return;
      }
      const role = e.target.closest("[data-rp-role]"); if (role) openRole(role.dataset.rpRole);
    });
    $("rpSheetBody").addEventListener("change", (e) => {
      if (e.target.name === "rpRole") return sheet?.redraw?.(e.target.value);
      if (e.target.matches("[data-rp-perm]")) { const box = $("rpEditor"); if (box) { const v = readEditor(box); if (sheet) sheet.draft = v; const vo = Boolean(box.querySelector(".rp-note")); box.innerHTML = editorHtml(vo, v); } }
    });
    $("rpSheetBody").addEventListener("click", (e) => {
      const preset = e.target.closest("[data-rp-preset]");
      if (preset) {
        const box = $("rpEditor"); const vo = Boolean(box.querySelector(".rp-note"));
        const acts = PRESETS[Number(preset.dataset.rpPreset)][1];
        const v = CATALOG.filter((p) => (acts === null || acts.includes(p.action)) && (!vo || p.action === "view")).map((p) => p.key);
        if (sheet) sheet.draft = v; box.innerHTML = editorHtml(vo, v); return;
      }
      const cyc = e.target.closest("[data-rp-cycle]"); if (cyc) sheet?.cycle?.(cyc.dataset.rpCycle);
    });
  }

  let wired = false;
  window.initRolesAdmin = async function initRolesAdmin(access) {
    if (!access?.is_super_admin || !$("rpRoot")) return;
    if (!wired) { wired = true; wire(); }
    try { await refresh(); } catch (err) { toast("error", "No se pudo cargar Roles y permisos", err.message); }
  };
})();
