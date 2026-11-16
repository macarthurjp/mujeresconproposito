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
    const { data: events, error } = await client().from("destacadas").select("*").order("orden", { ascending: true });
    if (error) { box.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`; return; }
    const { data: people } = await client().from("inscripciones").select("*").order("created_at");
    box.innerHTML = (events || []).map((e) => {
      const list = (people || []).filter((p) => p.destacada_id === String(e.id));
      const total = list.reduce((n, p) => n + 1 + (p.acompanantes || 0), 0);
      const local = e.fecha_evento ? new Date(e.fecha_evento) : null;
      const dateVal = local ? `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}` : "";
      return `<section class="admin-card ci-event" data-id="${esc(e.id)}">
        <div class="ci-event-head">
          <img src="${esc(e.foto_url)}" alt="" loading="lazy" />
          <div><h4>${esc(e.nombre || e.titulo)}</h4><p>${esc(e.titulo || "")}</p>${audit(e)}</div>
          <span class="ci-pill ${e.inscripcion_abierta ? "is-on" : ""}">${e.inscripcion_abierta ? `${total}${e.cupo ? ` / ${e.cupo}` : ""} inscritas` : "Sin inscripción"}</span>
        </div>
        <form class="ci-event-form">
          <label class="ci-check"><input type="checkbox" name="abierta" ${e.inscripcion_abierta ? "checked" : ""}/> Abrir inscripciones</label>
          <label>Fecha y hora <input type="datetime-local" name="fecha" value="${dateVal}" /></label>
          <label>Lugar <input type="text" name="lugar" value="${esc(e.lugar || "")}" placeholder="Dirección o “En línea”" /></label>
          <label>Plazas <input type="number" name="cupo" min="1" value="${e.cupo || ""}" placeholder="Sin límite" /></label>
          <button type="submit" class="btn">Guardar</button>
        </form>
        ${list.length ? `<details class="ci-people"><summary>Ver ${list.length} ${list.length === 1 ? "inscripción" : "inscripciones"} (${total} personas)</summary>
          <table><thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th><th>+</th><th>Fecha</th></tr></thead><tbody>
          ${list.map((p) => `<tr><td>${esc(p.nombre)}</td><td><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></td><td>${esc(p.telefono || "")}</td><td>${p.acompanantes || ""}</td><td>${fmt(p.created_at)}</td></tr>`).join("")}
          </tbody></table>
          <button type="button" class="admin-import-btn" data-csv="${esc(e.id)}">Descargar CSV</button></details>` : ""}
      </section>`;
    }).join("") || '<div class="admin-empty">No hay destacadas todavía.</div>';

    box.querySelectorAll(".ci-event-form").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const id = form.closest(".ci-event").dataset.id;
      const f = new FormData(form);
      const payload = {
        inscripcion_abierta: f.get("abierta") === "on",
        fecha_evento: f.get("fecha") ? new Date(String(f.get("fecha"))).toISOString() : null,
        lugar: String(f.get("lugar") || "").trim() || null,
        cupo: f.get("cupo") ? Math.max(1, Number(f.get("cupo"))) : null,
      };
      const { error: err } = await client().from("destacadas").update(payload).eq("id", id);
      if (err) return toast("error", "No se pudo guardar", err.message);
      toast("success", "Evento actualizado", payload.inscripcion_abierta ? "Inscripciones abiertas." : "Inscripciones cerradas.");
      loadEvents();
    }));
    box.querySelectorAll("[data-csv]").forEach((btn) => btn.addEventListener("click", () => {
      const list = (people || []).filter((p) => p.destacada_id === btn.dataset.csv);
      const rows = [["Nombre", "Correo", "Teléfono", "Acompañantes", "Fecha"], ...list.map((p) => [p.nombre, p.email, p.telefono || "", p.acompanantes || 0, fmt(p.created_at)])];
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      a.download = "inscripciones.csv";
      a.click();
    }));
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
  let people = [];
  let myName = "";

  async function loadFollow() {
    const { data, error } = await client().from("unirse")
      .select("id,nombre,apellido,email,telefono,comunidad,pais_residencia,created_at,estado_seguimiento,contactada_por,notas_seguimiento,seguimiento_at")
      .order("created_at", { ascending: false });
    if (error) { $("ciFollowList").innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`; return; }
    people = (data || []).map((p) => ({ ...p, estado_seguimiento: p.estado_seguimiento || "nueva" }));
    renderFollow();
  }

  function renderFollow() {
    $("ciFollowTabs").innerHTML = STATES.map((s) => {
      const n = people.filter((p) => p.estado_seguimiento === s.key).length;
      return `<button type="button" class="ci-tab ${followTab === s.key ? "is-on" : ""}" data-tab="${s.key}" style="--c:${s.color}"><strong>${n}</strong><span>${s.label}</span></button>`;
    }).join("");
    const color = STATES.find((s) => s.key === followTab).color;
    const list = people.filter((p) => p.estado_seguimiento === followTab);
    $("ciFollowList").innerHTML = list.length ? list.map((p) => {
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
  async function loadHistory() {
    const { data } = await client().from("push_broadcasts").select("*").order("created_at", { ascending: false }).limit(10);
    $("ciHistory").innerHTML = (data || []).map((h) => `<div class="ci-history-row"><strong>${esc(h.titulo)}</strong><span>${esc(h.mensaje)}</span><small>${fmt(h.created_at)} · ${esc(h.comunidad || "Todas")} · ${h.enviados} entregados</small></div>`).join("") || '<div class="admin-empty">Todavía no se ha enviado ningún aviso.</div>';
  }

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
      followTab = b.dataset.tab; renderFollow();
    });
    $("ciFollowList").addEventListener("submit", async (e) => {
      const form = e.target.closest(".ci-follow-form"); if (!form) return;
      e.preventDefault();
      const id = form.closest(".ci-person").dataset.id;
      const f = new FormData(form);
      const { error } = await client().rpc("set_member_followup", { p_id: id, p_estado: f.get("estado"), p_contactada_por: f.get("quien"), p_notas: f.get("notas") });
      if (error) return toast("error", "No se pudo guardar", error.message);
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
      if (!window.confirm(`¿Enviar este aviso a ${target ? `la comunidad de ${target}` : "todas las personas con la app"}?`)) return;
      const btn = e.submitter; if (btn) btn.disabled = true;
      try {
        const data = await invokeBroadcast({ titulo: $("ciTitle").value.trim(), mensaje: $("ciMessage").value.trim(), comunidad: target || null });
        toast("success", "Aviso enviado", `Entregado a ${data.enviados} dispositivos.`);
        e.target.reset(); sync(); loadHistory();
      } catch (err) { toast("error", "No se pudo enviar", err.message); }
      finally { if (btn) btn.disabled = false; }
    });
  }

  window.initCommunityAdmin = async function initCommunityAdmin(access) {
    const tabs = ["inscripciones", "seguimiento", "avisos", "estadisticas"].map((t) => document.querySelector(`[data-admin-tab="${t}"]`));
    if (!access?.is_super_admin) { tabs.forEach((t) => { if (t) t.hidden = true; }); return; }
    myName = access.nombre || access.email || "";
    wire();
    await Promise.allSettled([loadEvents(), loadFollow(), updateReach(), loadHistory(), loadStats()]);
  };
})();
