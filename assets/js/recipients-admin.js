// Super Admin: who receives the contact-form and join-form e-mails.
(function setupRecipientsAdmin() {
  "use strict";

  const COMMUNITIES = ["Europa", "Estados Unidos", "República Dominicana"];
  const GROUPS = [
    { form: "contact", comunidad: null, tint: "#a64b43", icon: "fa-envelope", title: "Formulario de contacto", hint: "Reciben los mensajes y las peticiones de oración." },
    { form: "join", comunidad: null, tint: "#6b5b95", icon: "fa-users", title: "Únete · Todas las comunidades", hint: "Reciben todos los registros, sin importar la comunidad." },
    ...COMMUNITIES.map((c) => ({ form: "join", comunidad: c, tint: c === "Europa" ? "#2f6db5" : c === "Estados Unidos" ? "#b5523b" : "#c08a3e", icon: c === "Europa" ? "fa-earth-europe" : c === "Estados Unidos" ? "fa-flag-usa" : "fa-sun", title: `Únete · ${c}`, hint: `Reciben solo los registros de quienes eligen ${c}.` })),
  ];

  let initialized = false;
  let rows = [];
  const $ = (id) => document.getElementById(id);

  function client() {
    const value = window.McpSupabase?.getSupabaseBrowserClient();
    if (!value) throw new Error("Supabase no está disponible.");
    return value;
  }

  function toast(kind, title, text) {
    if (typeof window.showAdminToast === "function") return window.showAdminToast(kind, title, text);
    if (kind === "error") window.alert(`${title}\n${text || ""}`);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
  }

  function render() {
    const list = $("adminRecipientsList");
    if (!list) return;
    list.innerHTML = GROUPS.map((group) => {
      const items = rows.filter((r) => r.form === group.form && (r.comunidad || null) === group.comunidad);
      const body = items.length
        ? items.map((r) => `
          <li class="admin-recipient${r.active ? "" : " is-paused"}">
            <span class="admin-recipient-avatar">${esc((r.nombre || r.email).charAt(0).toUpperCase())}</span>
            <span class="admin-recipient-copy"><strong>${esc(r.email)}</strong><small>${esc(r.nombre || (r.active ? "Activo" : "En pausa"))}</small></span>
            <button type="button" class="admin-switch" role="switch" aria-checked="${r.active ? "true" : "false"}" data-recipient-toggle="${esc(r.id)}" aria-label="Activo ${esc(r.email)}" title="${r.active ? "Recibe correos · tocar para pausar" : "En pausa · tocar para activar"}"><span class="admin-switch-track" aria-hidden="true"></span><span class="admin-switch-label">${r.active ? "Activo" : "Pausa"}</span></button>
            <button type="button" class="admin-recipient-remove" data-recipient-remove="${esc(r.id)}" aria-label="Quitar ${esc(r.email)}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
          </li>`).join("")
        : `<li class="admin-recipient-empty">Sin destinatarios: se usa el correo principal.</li>`;
      return `
        <section class="admin-card admin-recipient-group">
          <div class="admin-recipient-head"><span class="admin-recipient-icon" style="background:${group.tint}"><i class="fa-solid ${group.icon}" aria-hidden="true"></i></span><div><h4>${esc(group.title)}</h4><p>${esc(group.hint)}</p></div>
          <button type="button" class="admin-recipient-add" data-recipient-add="${group.form}|${group.comunidad || ""}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir</button></div>
          <ul>${body}</ul>
        </section>`;
    }).join("");
  }

  async function load() {
    const { data, error } = await client()
      .from("notification_recipients")
      .select("id,form,comunidad,email,nombre,active")
      .order("created_at", { ascending: true });
    if (error) throw error;
    rows = data || [];
    render();
  }

  function syncComunidadField() {
    const field = $("adminRecipientComunidadField");
    if (field) field.hidden = $("adminRecipientFormType")?.value !== "join";
  }

  async function add(event) {
    event.preventDefault();
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    const email = $("adminRecipientEmail").value.trim().toLowerCase();
    const form = $("adminRecipientFormType").value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      window.McpFormDirty?.markFailed(event.target);
      return toast("error", "Correo no válido", "Revisa el correo e inténtalo de nuevo.");
    }
    if (button) button.disabled = true;
    try {
      const { error } = await client().from("notification_recipients").insert({
        form,
        comunidad: form === "join" ? ($("adminRecipientComunidad").value || null) : null,
        email,
        nombre: $("adminRecipientNombre").value.trim() || null,
      });
      if (error) throw new Error(error.code === "23505" ? "Ese correo ya recibe este formulario." : error.message);
      $("adminRecipientEmail").value = "";
      $("adminRecipientNombre").value = "";
      await load();
      toast("success", "Destinatario añadido", email);
      window.McpFormDirty?.markSaved(event.target);
    } catch (error) {
      toast("error", "No se pudo añadir", error?.message);
      window.McpFormDirty?.markFailed(event.target);
    } finally {
      if (window.McpFormDirty) window.McpFormDirty.sync(event.target);
      else if (button) button.disabled = false;
    }
  }

  async function onListClick(event) {
    const toggle = event.target.closest("[data-recipient-toggle]");
    if (toggle) return toggleActive(toggle);
    const addBtn = event.target.closest("[data-recipient-add]");
    if (addBtn) {
      const [form, comunidad] = addBtn.dataset.recipientAdd.split("|");
      $("adminRecipientFormType").value = form;
      $("adminRecipientComunidad").value = comunidad;
      syncComunidadField();
      $("adminRecipientForm")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => $("adminRecipientEmail")?.focus(), 350);
      return;
    }
    const removeBtn = event.target.closest("[data-recipient-remove]");
    if (!removeBtn) return;
    const row = rows.find((r) => r.id === removeBtn.dataset.recipientRemove);
    if (!row || !window.confirm(`${row.email} dejará de recibir estos correos. ¿Quitarlo?`)) return;
    removeBtn.disabled = true;
    try {
      const { error } = await client().from("notification_recipients").delete().eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (error) {
      removeBtn.disabled = false;
      toast("error", "No se pudo quitar", error?.message);
    }
  }

  async function toggleActive(toggle) {
    const next = toggle.getAttribute("aria-checked") !== "true";
    toggle.disabled = true;
    try {
      const { error } = await client().from("notification_recipients").update({ active: next }).eq("id", toggle.dataset.recipientToggle);
      if (error) throw error;
      await load();
    } catch (error) {
      toggle.disabled = false;
      toast("error", "No se pudo actualizar", error?.message);
    }
  }

  window.initRecipientsAdmin = async function initRecipientsAdmin(access) {
    const tab = document.querySelector('[data-admin-tab="correos"]');
    if (!access?.is_super_admin) {
      if (tab) tab.hidden = true;
      return;
    }
    if (!initialized) {
      initialized = true;
      $("adminRecipientForm")?.addEventListener("submit", add);
      $("adminRecipientFormType")?.addEventListener("change", syncComunidadField);
      $("adminRecipientsList")?.addEventListener("click", onListClick);
      syncComunidadField();
    }
    try {
      await load();
    } catch (error) {
      const list = $("adminRecipientsList");
      if (list) list.innerHTML = `<div class="admin-empty">${esc(error?.message || "No se pudieron cargar los destinatarios.")}</div>`;
    }
  };
})();
