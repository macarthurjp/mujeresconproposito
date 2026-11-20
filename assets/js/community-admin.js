// Super Admin: Inscripciones, Seguimiento, Avisos push and Estadísticas
// (same features as the app's admin screens).
(function setupCommunityAdmin() {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const client = () => {
    const c = window.McpSupabase?.getSupabaseBrowserClient();
    if (!c) throw new Error("Supabase no está disponible.");
    return c;
  };
  const toast = (kind, title, text) => (window.showAdminToast ? window.showAdminToast(kind, title, text) : kind === "error" && window.alert(`${title}\n${text || ""}`));
  const fmt = (iso, withTime = true) => iso
    ? new Intl.DateTimeFormat("es", withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso)).replace(".", "")
    : "";
  const ago = (iso) => {
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    return d <= 0 ? "hoy" : d === 1 ? "ayer" : d < 30 ? `hace ${d} días` : fmt(iso, false);
  };
  const audit = (row) => {
    const created = row.creado_at ? `Agregado ${fmt(row.creado_at)}${row.creado_por_nombre ? ` · ${esc(row.creado_por_nombre)}` : ""}` : "Agregado: sin registro";
    const modified = row.modificado_at ? `Modificado ${fmt(row.modificado_at)}${row.modificado_por_nombre ? ` · ${esc(row.modificado_por_nombre)}` : ""}` : "";
    return `<p class="ci-audit"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${created}${modified ? `<br><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> ${modified}` : ""}</p>`;
  };

  // ---------------- Inscripciones ----------------
  async function loadEvents() {
    const box = $("ciEvents");
    if (!box) return;
    box.setAttribute("aria-busy", "true");
    let events, error;
    try { ({ data: events, error } = await client().from("destacadas").select("*").order("orden", { ascending: true })); }
    catch (loadError) {
      box.innerHTML = `<div class="admin-empty">No se pudieron cargar los eventos: ${esc(loadError.message)} <button type="button" class="ci-retry-btn">Reintentar</button></div>`;
      box.querySelector(".ci-retry-btn")?.addEventListener("click", loadEvents);
      box.removeAttribute("aria-busy"); return;
    }
    if (error) { box.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`; box.removeAttribute("aria-busy"); return; }
    const rows = [];
    for (let offset = 0; offset < (events || []).length; offset += 8) {
      const group = await Promise.all(events.slice(offset, offset + 8).map(async (e) => {
        try {
          const { count, error: countError } = await client().from("inscripciones").select("id", { count: "exact", head: true }).eq("destacada_id", String(e.id));
          return { event: e, count: countError ? null : count };
        } catch { return { event: e, count: null }; }
      }));
      rows.push(...group);
    }
    const registrations = rows.reduce((n, row) => n + (row.count || 0), 0);
    const active = rows.filter((row) => row.event.inscripcion_abierta).length;
    box.innerHTML = `<section class="ci-inscriptions-overview" aria-label="Resumen de inscripciones">
      <article><i class="fa-regular fa-calendar" aria-hidden="true"></i><div><span>Eventos</span><strong>${rows.length}</strong></div></article>
      <article class="is-accent"><i class="fa-solid fa-door-open" aria-hidden="true"></i><div><span>Con inscripción abierta</span><strong>${active}</strong></div></article>
      <article><i class="fa-solid fa-user-check" aria-hidden="true"></i><div><span>Inscripciones registradas</span><strong>${registrations}</strong></div></article>
      <label class="ci-event-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" id="ciEventSearch" placeholder="Buscar un evento…" aria-label="Buscar un evento" /></label>
    </section><div class="ci-events-toolbar"><div><strong>Eventos y participantes</strong><span>Los participantes se cargan al abrir cada evento.</span></div><label>Mostrar <select id="ciEventFilter" aria-label="Filtrar eventos"><option value="all">Todos los eventos</option><option value="open">Inscripción abierta</option><option value="closed">Sin inscripción</option></select></label></div>
      <div class="ci-events-results" id="ciEventsResults" aria-live="polite">${rows.map(({ event: e, count }) => {
        const local = e.fecha_evento ? new Date(e.fecha_evento) : null;
        const dateVal = local ? `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}` : "";
        const totalCapacity = Number(e.cupo) || 0;
        const countLabel = count === null ? "Conteo no disponible" : count === 1 ? "1 inscripción" : `${count} inscripciones`;
        return `<article class="ci-event-row" data-id="${esc(e.id)}" data-open="${e.inscripcion_abierta ? "true" : "false"}" data-search="${esc(`${e.nombre || ""} ${e.titulo || ""}`.toLocaleLowerCase())}">
          <div class="ci-event-summary">
            <img class="ci-event-poster" src="${esc(e.foto_url)}" alt="" loading="lazy" />
            <div class="ci-event-copy"><span class="ci-event-status ${e.inscripcion_abierta ? "is-open" : ""}"><i></i>${e.inscripcion_abierta ? "Inscripción abierta" : "Sin inscripción"}</span><h4>${esc(e.nombre || e.titulo)}</h4><p>${esc(e.titulo || "Evento de la comunidad")}</p><div class="ci-event-meta">${e.fecha_evento ? `<span><i class="fa-regular fa-calendar" aria-hidden="true"></i>${esc(fmt(e.fecha_evento))}</span>` : ""}<span><i class="fa-regular fa-user" aria-hidden="true"></i>${esc(countLabel)}${totalCapacity ? ` · ${totalCapacity} plazas` : ""}</span></div>
            </div>
            <div class="ci-event-controls"><button type="button" class="ci-event-action" data-toggle-panel="settings" aria-expanded="false"><i class="fa-solid fa-sliders" aria-hidden="true"></i><span>Configurar</span><i class="fa-solid fa-chevron-down ci-chevron" aria-hidden="true"></i></button><button type="button" class="ci-event-action is-primary" data-toggle-panel="people" aria-expanded="false"><i class="fa-solid fa-users" aria-hidden="true"></i><span>Participantes</span><b>${count === null ? "—" : count}</b><i class="fa-solid fa-chevron-down ci-chevron" aria-hidden="true"></i></button></div>
          </div>
          <div class="ci-event-panel" data-panel="settings" hidden><form class="ci-event-form">
            <label class="ci-check ci-wide"><input type="checkbox" name="abierta" ${e.inscripcion_abierta ? "checked" : ""}/> <span>Requiere inscripción<small>${e.inscripcion_abierta ? "Se muestra el botón “Inscribirme”." : "Solo anuncio, sin botón."}</small></span></label>
            <label class="ci-when-on">Fecha y hora<input type="datetime-local" name="fecha" value="${dateVal}" /></label>
            <label class="ci-when-on ci-address-field">Lugar<input type="text" name="lugar" value="${esc(e.lugar || "")}" placeholder="Escribe una dirección o “En línea”" data-address-autocomplete /></label>
            <label class="ci-when-on">Plazas<input type="number" name="cupo" min="1" value="${e.cupo || ""}" placeholder="Sin límite" /></label>
            <button type="submit" class="btn">Guardar configuración</button>
          </form>${audit(e)}</div>
          <div class="ci-event-panel ci-people-panel" data-panel="people" hidden><div class="ci-people-toolbar"><div><strong>Lista de participantes</strong><span class="ci-people-count">${esc(countLabel)}</span></div><div class="ci-people-actions"><label class="ci-people-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Buscar nombre, correo o teléfono" aria-label="Buscar participantes" /></label><button type="button" class="ci-export-btn" data-csv="${esc(e.id)}"><i class="fa-solid fa-arrow-down-to-line" aria-hidden="true"></i> Exportar CSV</button></div></div><div class="ci-people-results"><div class="admin-empty">Abre Participantes para cargar los registros.</div></div></div>
        </article>`;
      }).join("") || '<div class="admin-empty">No hay eventos disponibles.</div>'}</div>`;

    box.querySelectorAll(".ci-event-form").forEach((form) => {
      const sync = () => form.classList.toggle("is-off", !form.elements.abierta.checked);
      form.elements.abierta.addEventListener("change", sync);
      sync();
    });
    box.querySelectorAll(".ci-event-row").forEach((card) => card.classList.toggle("is-signup", card.querySelector('[name="abierta"]').checked));
    box.querySelectorAll(".ci-event-form").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.closest(".ci-event-row").dataset.id;
      const f = new FormData(form);
      const payload = {
        inscripcion_abierta: f.get("abierta") === "on",
        fecha_evento: f.get("fecha") ? new Date(String(f.get("fecha"))).toISOString() : null,
        lugar: String(f.get("lugar") || "").trim() || null,
        cupo: f.get("cupo") ? Math.max(1, Number(f.get("cupo"))) : null,
      };
      const { error: err } = await client().from("destacadas").update(payload).eq("id", id);
      if (err) {
        window.McpFormDirty?.markFailed(form);
        return toast("error", "No se pudo guardar", err.message);
      }
      window.McpFormDirty?.markSaved(form);
      toast("success", "Evento actualizado", payload.inscripcion_abierta ? "Inscripciones abiertas." : "Inscripciones cerradas.");
      await loadEvents();
    }));
    wireEventDirectory(box);
    box.removeAttribute("aria-busy");
  }

  const PAGE_SIZE = 25;
  function wireEventDirectory(box) {
    const applyFilters = () => {
      const query = $("ciEventSearch")?.value.trim().toLocaleLowerCase() || "";
      const filter = $("ciEventFilter")?.value || "all";
      let visible = 0;
      box.querySelectorAll(".ci-event-row").forEach((card) => {
        const show = card.dataset.search.includes(query) && (filter === "all" || card.dataset.open === (filter === "open" ? "true" : "false"));
        card.hidden = !show;
        if (show) visible++;
      });
      let empty = box.querySelector(".ci-events-filter-empty");
      if (!visible && !empty) { empty = document.createElement("div"); empty.className = "admin-empty ci-events-filter-empty"; empty.textContent = "No hay eventos que coincidan con la búsqueda."; $("ciEventsResults")?.append(empty); }
      if (visible && empty) empty.remove();
    };
    $("ciEventSearch")?.addEventListener("input", applyFilters);
    $("ciEventFilter")?.addEventListener("change", applyFilters);
    box.querySelectorAll("[data-toggle-panel]").forEach((button) => button.addEventListener("click", async () => {
      const card = button.closest(".ci-event-row");
      const kind = button.dataset.togglePanel;
      const panel = card.querySelector(`[data-panel="${kind}"]`);
      const opening = panel.hidden;
      card.querySelectorAll(".ci-event-panel").forEach((other) => { other.hidden = true; });
      card.querySelectorAll("[data-toggle-panel]").forEach((other) => other.setAttribute("aria-expanded", "false"));
      if (!opening) return;
      panel.hidden = false;
      button.setAttribute("aria-expanded", "true");
      if (kind === "people" && panel.dataset.loaded !== "true") await loadEventPeople(card, 0, "");
      if (kind === "people") panel.querySelector("input[type=search]")?.focus({ preventScroll: true });
    }));
    box.querySelectorAll(".ci-people-panel").forEach((panel) => {
      const input = panel.querySelector("input[type=search]");
      let timer = 0;
      input?.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => loadEventPeople(panel.closest(".ci-event-row"), 0, input.value), 250);
      });
    });
    box.querySelectorAll("[data-csv]").forEach((button) => button.addEventListener("click", () => exportEventCsv(button.dataset.csv, button)));
  }

  function safeIlike(value) { return String(value || "").replace(/[(),%_*]/g, " ").replace(/\s+/g, " ").trim(); }
  async function loadEventPeople(card, page, search) {
    if (!card) return;
    const panel = card.querySelector('.ci-people-panel');
    const results = panel?.querySelector('.ci-people-results');
    if (!results) return;
    const id = card.dataset.id;
    const term = safeIlike(search);
    const requestId = String((Number(panel.dataset.requestId) || 0) + 1);
    panel.dataset.requestId = requestId;
    results.setAttribute("aria-busy", "true");
    results.innerHTML = '<div class="admin-empty">Cargando participantes…</div>';
    let request = client().from("inscripciones").select("*", { count: "exact" }).eq("destacada_id", id).order("created_at", { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (term) request = request.or(`nombre.ilike.%${term}%,email.ilike.%${term}%,telefono.ilike.%${term}%`);
    let data, error, count;
    try { ({ data, error, count } = await request); }
    catch (loadError) {
      if (panel.dataset.requestId !== requestId) return;
      results.innerHTML = `<div class="admin-empty">No se pudieron cargar los participantes: ${esc(loadError.message)} <button type="button" class="ci-retry-btn">Reintentar</button></div>`;
      results.querySelector(".ci-retry-btn")?.addEventListener("click", () => loadEventPeople(card, page, search));
      results.removeAttribute("aria-busy"); return;
    }
    if (panel.dataset.requestId !== requestId) return;
    if (error) { results.innerHTML = `<div class="admin-empty">No se pudieron cargar los participantes: ${esc(error.message)} <button type="button" class="ci-retry-btn">Reintentar</button></div>`; results.querySelector(".ci-retry-btn")?.addEventListener("click", () => loadEventPeople(card, page, search)); results.removeAttribute("aria-busy"); return; }
    panel.dataset.loaded = "true";
    panel.dataset.page = String(page);
    panel.dataset.count = String(count || 0);
    panel.dataset.search = search || "";
    const tbody = (data || []).map((p) => `<tr><td data-label="Nombre">${esc(p.nombre || "—")}</td><td data-label="Correo"><a href="mailto:${esc(p.email)}">${esc(p.email || "—")}</a></td><td data-label="Teléfono">${esc(p.telefono || "—")}</td><td data-label="Acompañantes">${Number(p.acompanantes) || 0}</td><td data-label="Fecha">${esc(fmt(p.created_at))}</td></tr>`).join("");
    const pages = Math.ceil((count || 0) / PAGE_SIZE);
    const start = count ? page * PAGE_SIZE + 1 : 0;
    const end = Math.min((page + 1) * PAGE_SIZE, count || 0);
    results.innerHTML = data?.length ? `<div class="ci-table-scroll"><table class="ci-people-table"><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>Acompañantes</th><th>Fecha</th></tr></thead><tbody>${tbody}</tbody></table></div><div class="ci-people-pagination"><span>Mostrando ${start}–${end} de ${count}</span><div><button type="button" data-page="${page - 1}" ${page <= 0 ? "disabled" : ""} aria-label="Página anterior"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><span>Página ${page + 1} de ${pages}</span><button type="button" data-page="${page + 1}" ${page + 1 >= pages ? "disabled" : ""} aria-label="Página siguiente"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div></div>` : `<div class="admin-empty">${term ? "No hay resultados para esta búsqueda." : "Este evento aún no tiene inscripciones."}</div>`;
    panel.querySelector(".ci-people-count").textContent = `${count || 0} ${(count || 0) === 1 ? "inscripción" : "inscripciones"}`;
    panel.querySelector("[data-csv]").disabled = !count;
    results.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => loadEventPeople(card, Number(button.dataset.page), panel.dataset.search)));
    results.removeAttribute("aria-busy");
  }

  async function exportEventCsv(id, button) {
    const old = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Preparando…';
    try {
      const all = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await client().from("inscripciones").select("nombre,email,telefono,acompanantes,created_at").eq("destacada_id", id).order("created_at", { ascending: false }).range(start, start + 999);
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const rows = [["Nombre", "Correo", "Teléfono", "Acompañantes", "Fecha"], ...all.map((p) => [p.nombre, p.email, p.telefono || "", p.acompanantes || 0, fmt(p.created_at)])];
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = "inscripciones.csv"; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast("error", "No se pudo exportar", error.message); }
    finally { button.disabled = false; button.innerHTML = old; }
  }

  // ---------------- Seguimiento ----------------
  const STATES = [
    { key: "nueva", label: "Nuevas", color: "#d64545" },
    { key: "contactada", label: "Contactadas", color: "#c08a3e" },
    { key: "integrada", label: "Integradas", color: "#2f7d4f" },
    { key: "sin_respuesta", label: "Sin respuesta", color: "#8e8187" },
  ];
  const ONE = { nueva: "Nueva", contactada: "Contactada", integrada: "Integrada", sin_respuesta: "Sin respuesta" };
  let followTab = "nueva";
  let followPage = 0;
  const FOLLOW_PAGE_SIZE = 25;
  let people = [];
  let followCounts = {};
  let myName = "";

  async function loadFollow() {
    try {
      const db = client();
      const counts = await Promise.all(STATES.map(async (state) => {
        let query = db.from("unirse").select("id", { count: "exact", head: true });
        query = state.key === "nueva" ? query.or("estado_seguimiento.eq.nueva,estado_seguimiento.is.null") : query.eq("estado_seguimiento", state.key);
        const { count, error } = await query;
        if (error) throw error;
        return [state.key, count || 0];
      }));
      followCounts = Object.fromEntries(counts);
      followPage = Math.min(followPage, Math.max(0, Math.ceil((followCounts[followTab] || 0) / FOLLOW_PAGE_SIZE) - 1));
      const offset = followPage * FOLLOW_PAGE_SIZE;
      let query = db.from("unirse").select("id,nombre,apellido,email,telefono,comunidad,pais_residencia,created_at,estado_seguimiento,contactada_por,notas_seguimiento,seguimiento_at", { count: "exact" });
      query = followTab === "nueva" ? query.or("estado_seguimiento.eq.nueva,estado_seguimiento.is.null") : query.eq("estado_seguimiento", followTab);
      const { data, error } = await query.order("created_at", { ascending: false }).range(offset, offset + FOLLOW_PAGE_SIZE - 1);
      if (error) throw error;
      people = (data || []).map((p) => ({ ...p, estado_seguimiento: p.estado_seguimiento || "nueva" }));
    } catch (error) {
      $("ciFollowList").innerHTML = `<div class="admin-empty">No se pudo cargar el seguimiento: ${esc(error.message)} <button type="button" class="ci-retry-btn" id="ciFollowRetry">Reintentar</button></div>`;
      $("ciFollowRetry")?.addEventListener("click", loadFollow);
      return;
    }
    renderFollow();
  }

  function renderFollow() {
    $("ciFollowTabs").innerHTML = STATES.map((s) => {
      const n = followCounts[s.key] || 0;
      return `<button type="button" class="ci-tab ${followTab === s.key ? "is-on" : ""}" data-tab="${s.key}" style="--c:${s.color}"><strong>${n}</strong><span>${s.label}</span></button>`;
    }).join("");
    const color = STATES.find((s) => s.key === followTab).color;
    const total = followCounts[followTab] || 0;
    const pages = Math.max(1, Math.ceil(total / FOLLOW_PAGE_SIZE));
    const list = people;
    const cards = list.length ? list.map((p) => {
      const phone = String(p.telefono || "").replace(/[^+\d]/g, "");
      return `<article class="admin-card ci-person" data-id="${esc(p.id)}">
        <div class="ci-person-head"><span class="ci-dot" style="background:${color}"></span>
          <div><h4>${esc(`${p.nombre || ""} ${p.apellido || ""}`.trim())}</h4><p>${esc(p.comunidad || "Sin comunidad")} · ${ago(p.created_at)}</p></div>
          <div class="ci-actions">
            ${phone ? `<a class="ci-icon" href="tel:${esc(phone)}" title="Llamar"><i class="fa-solid fa-phone"></i></a><a class="ci-icon" href="https://wa.me/${esc(phone.replace(/\D/g, ""))}" target="_blank" rel="noopener" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
            ${p.email ? `<a class="ci-icon" href="mailto:${esc(p.email)}" title="Correo"><i class="fa-regular fa-envelope"></i></a>` : ""}
          </div>
        </div>
        <form class="ci-follow-form">
          <label>Estado <select name="estado">${STATES.map((s) => `<option value="${s.key}" ${p.estado_seguimiento === s.key ? "selected" : ""}>${ONE[s.key]}</option>`).join("")}</select></label>
          <label>Contactada por <input name="quien" value="${esc(p.contactada_por || myName)}" /></label>
          <label class="ci-wide">Notas <textarea name="notas" rows="2">${esc(p.notas_seguimiento || "")}</textarea></label>
          <button type="submit" class="btn">Guardar</button>
          ${p.seguimiento_at ? `<small class="ci-updated">Actualizado ${ago(p.seguimiento_at)}</small>` : ""}
        </form>
      </article>`;
    }).join("") : `<div class="admin-empty">${followTab === "nueva" ? "¡Todas las nuevas ya fueron contactadas!" : "No hay personas en este estado."}</div>`;
    const pager = total > FOLLOW_PAGE_SIZE ? `<nav class="admin-list-pagination" aria-label="Paginación de seguimiento"><span>Mostrando ${followPage * FOLLOW_PAGE_SIZE + 1}–${Math.min((followPage + 1) * FOLLOW_PAGE_SIZE, total)} de ${total}</span><div><button type="button" data-follow-page="${followPage - 1}" ${followPage === 0 ? "disabled" : ""} aria-label="Página anterior">‹</button><span>Página ${followPage + 1} de ${pages}</span><button type="button" data-follow-page="${followPage + 1}" ${followPage + 1 >= pages ? "disabled" : ""} aria-label="Página siguiente">›</button></div></nav>` : "";
    $("ciFollowList").innerHTML = cards + pager;
  }

  // ---------------- Avisos push ----------------
  async function invokeBroadcast(body) {
    const { data, error } = await client().functions.invoke("send-broadcast", { body });
    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error || "No se pudo enviar.");
    return data;
  }
  async function updateReach() {
    try {
      const data = await invokeBroadcast({ titulo: "x", mensaje: "x", comunidad: $("ciTarget").value || null, dryRun: true });
      $("ciReach").textContent = `${data.destinatarios} ${data.destinatarios === 1 ? "dispositivo recibirá" : "dispositivos recibirán"} el aviso.`;
    } catch { $("ciReach").textContent = "No se pudo calcular el alcance."; }
  }
  let canDeleteHistory = false;
  async function loadHistory() {
    const history = $("ciHistory");
    if (!history) return;
    history.setAttribute("aria-busy", "true");
    try {
      const { data, error } = await client().from("push_broadcasts").select("id,titulo,mensaje,comunidad,enviados,created_at").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      history.innerHTML = (data || []).map((h) => `<article class="ci-history-row"><span class="ci-history-icon" aria-hidden="true"><i class="fa-solid fa-paper-plane"></i></span><div><strong>${esc(h.titulo)}</strong><span>${esc(h.mensaje)}</span><small><span>${fmt(h.created_at)}</span><span>${esc(h.comunidad || "Todas")}</span><span>${Number(h.enviados) || 0} entregados</span></small></div>${canDeleteHistory ? `<button type="button" class="ci-history-delete" data-broadcast-delete="${Number(h.id)}" aria-label="Eliminar «${esc(h.titulo)}» del historial" title="Eliminar del historial"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>` : ""}</article>`).join("") || '<div class="admin-empty">Todavía no se ha enviado ningún aviso.</div>';
    } catch (error) {
      history.innerHTML = `<div class="admin-empty">No se pudo cargar el historial: ${esc(error.message)} <button type="button" class="ci-retry-btn" id="ciHistoryRetry">Reintentar</button></div>`;
      $("ciHistoryRetry")?.addEventListener("click", loadHistory);
    } finally {
      history.removeAttribute("aria-busy");
    }
  }
  // Removes a sent notice from the history only: phones that received it keep it.
  document.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-broadcast-delete]");
    if (!button) return;
    if (!window.confirm("¿Eliminar este aviso del historial?\n\nSolo se quita de esta lista: los teléfonos que ya lo recibieron lo conservan.")) return;
    button.disabled = true;
    const { error } = await client().from("push_broadcasts").delete().eq("id", Number(button.dataset.broadcastDelete));
    if (error) { button.disabled = false; window.alert(`No se pudo eliminar: ${error.message}`); return; }
    await loadHistory();
  });

  // ---------------- Estadísticas ----------------
  async function loadStats() {
    const box = $("ciStats");
    const { data: s, error } = await client().rpc("estadisticas_panel");
    if (error) { box.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`; return; }
    const seg = s.seguimiento || {};
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11 + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { label: d.toLocaleDateString("es", { month: "short" }).replace(".", ""), value: (s.registros_por_mes.find((m) => m.mes === key) || {}).total || 0 };
    });
    const max = Math.max(1, ...months.map((m) => m.value));
    const ranked = (rows, unit) => {
      const top = Math.max(1, ...rows.map((r) => r.value));
      return rows.length ? `<div class="ci-ranked">${rows.map((r) => `<div class="ci-rank"><span>${esc(r.label)}</span><div class="ci-rank-track"><i style="width:${(r.value / top) * 100}%"></i></div><b>${r.value} <small>${unit}</small></b></div>`).join("")}</div>` : '<p class="ci-muted">Aún no hay datos.</p>';
    };
    box.innerHTML = `
      <div class="ci-tiles">
        <div class="admin-card ci-tile"><strong>${s.miembros_total}</strong><span>Miembros registradas</span></div>
        <div class="admin-card ci-tile"><strong>${s.dispositivos_app}</strong><span>Teléfonos con la app</span></div>
        <div class="admin-card ci-tile"><strong>${seg.nueva || 0}</strong><span>Nuevas sin contactar</span></div>
        <div class="admin-card ci-tile"><strong>${seg.integrada || 0}</strong><span>Integradas</span></div>
      </div>
      <div class="ci-grid">
        <section class="admin-card"><h3>Registros por mes</h3><div class="ci-bars">${months.map((m) => `<div><b>${m.value || ""}</b><i style="height:${Math.max(3, (m.value / max) * 100)}%"></i><small>${m.label}</small></div>`).join("")}</div></section>
        <section class="admin-card"><h3>Por comunidad</h3>${ranked(s.por_comunidad.map((c) => ({ label: c.comunidad, value: c.total })), "")}</section>
        <section class="admin-card"><h3>Devocionales más leídos · 30 días</h3>${ranked(s.devocionales_leidos.map((d) => ({ label: d.titulo, value: d.lecturas })), "lecturas")}</section>
        <section class="admin-card"><h3>“Unirme” en reuniones · 30 días</h3>${ranked(s.unirme_reuniones.map((u) => ({ label: u.titulo, value: u.clics })), "veces")}</section>
        <section class="admin-card"><h3>Inscripciones a eventos</h3>${ranked(s.inscripciones.map((e) => ({ label: e.cupo ? `${e.evento} (de ${e.cupo})` : e.evento, value: e.personas })), "personas")}</section>
      </div>`;
  }

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    $("ciFollowTabs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]"); if (!b) return;
      followTab = b.dataset.tab; followPage = 0; loadFollow();
    });
    $("ciFollowList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-follow-page]");
      if (!b || b.disabled) return;
      followPage = Number(b.dataset.followPage) || 0;
      loadFollow();
    });
    $("ciFollowList").addEventListener("submit", async (e) => {
      const form = e.target.closest(".ci-follow-form"); if (!form) return;
      e.preventDefault();
      const id = form.closest(".ci-person").dataset.id;
      const f = new FormData(form);
      const { error } = await client().rpc("set_member_followup", { p_id: id, p_estado: f.get("estado"), p_contactada_por: f.get("quien"), p_notas: f.get("notas") });
      if (error) {
        window.McpFormDirty?.markFailed(form);
        return toast("error", "No se pudo guardar", error.message);
      }
      window.McpFormDirty?.markSaved(form);
      toast("success", "Seguimiento guardado", "");
      loadFollow();
    });
    $("ciTarget").addEventListener("change", updateReach);
    const sync = () => { $("ciPrevTitle").textContent = $("ciTitle").value || "Título del aviso"; $("ciPrevBody").textContent = $("ciMessage").value || "Así verán el aviso en su teléfono."; };
    $("ciTitle").addEventListener("input", sync);
    $("ciMessage").addEventListener("input", sync);
    $("ciBroadcastForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const target = $("ciTarget").value;
      if (!window.confirm(`¿Enviar este aviso a ${target ? `la comunidad de ${target}` : "todas las personas con la app"}?`)) {
        window.setTimeout(() => window.McpFormDirty?.markFailed(e.target), 0);
        return;
      }
      const btn = e.submitter; if (btn) btn.disabled = true;
      try {
        const data = await invokeBroadcast({ titulo: $("ciTitle").value.trim(), mensaje: $("ciMessage").value.trim(), comunidad: target || null });
        toast("success", "Aviso enviado", `Entregado a ${data.enviados} dispositivos.`);
        e.target.reset(); sync(); loadHistory();
        window.McpFormDirty?.markSaved(e.target);
      } catch (err) {
        window.McpFormDirty?.markFailed(e.target);
        toast("error", "No se pudo enviar", err.message);
      }
      finally {
        if (window.McpFormDirty) window.McpFormDirty.sync(e.target);
        else if (btn) btn.disabled = false;
      }
    });
  }

  window.initCommunityAdmin = async function initCommunityAdmin(access) {
    const tabs = ["inscripciones", "seguimiento", "avisos", "estadisticas"].map((t) => document.querySelector(`[data-admin-tab="${t}"]`));
    const can = (m, a) => Boolean(access?.is_super_admin) || Boolean(window.McpAdminPerms?.can(m, a));
    const show = { inscripciones: can("content", "edit"), seguimiento: can("dashboard", "followup"), estadisticas: can("dashboard", "followup"), avisos: can("notices", "view") };
    tabs.forEach((t) => { if (t) t.hidden = !show[t.dataset.adminTab]; });
    myName = access.nombre || access.email || "";
    wire();
    // Notices: access without the send permission is read-only (history only).
    const canSend = can("notices", "send");
    canDeleteHistory = canSend;
    const form = $("ciBroadcastForm");
    if (form) form.closest(".ci-broadcast").hidden = !canSend;
    const readOnlyNote = document.getElementById("ciReadOnlyNote");
    if (readOnlyNote) readOnlyNote.hidden = !show.avisos || canSend;
    await Promise.allSettled([
      show.inscripciones ? loadEvents() : null,
      show.seguimiento ? loadFollow() : null,
      canSend ? updateReach() : null,
      show.avisos ? loadHistory() : null,
      show.estadisticas ? loadStats() : null,
    ]);
  };
})();
