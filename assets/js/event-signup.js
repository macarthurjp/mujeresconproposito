/* Public sign-up for special events (destacadas with inscripcion_abierta). Mirrors the app's EventSignup sheet. */
(function () {
  "use strict";
  var STORE = "mcp-inscripciones";
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var client = function () { return window.McpSupabase && window.McpSupabase.getSupabaseBrowserClient && window.McpSupabase.getSupabaseBrowserClient(); };
  function signed() { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch (_) { return []; } }
  function remember(id) { try { var l = signed(); if (l.indexOf(id) === -1) l.push(id); localStorage.setItem(STORE, JSON.stringify(l)); } catch (_) {} }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var s = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function ics(item) {
    var start = new Date(item.fechaEvento);
    var end = new Date(start.getTime() + 2 * 3600 * 1000);
    var f = function (d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
    var t = function (v) { return String(v || "").replace(/[\\,;]/g, "\\$&").replace(/\n/g, "\\n"); };
    var body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MCP930//Eventos//ES", "BEGIN:VEVENT",
      "UID:evento-" + item.id + "@mcp930.org", "DTSTAMP:" + f(new Date()), "DTSTART:" + f(start), "DTEND:" + f(end),
      "SUMMARY:" + t(item.nombre + (item.titulo ? " · " + item.titulo : "")), item.lugar ? "LOCATION:" + t(item.lugar) : "",
      "DESCRIPTION:" + t("Mujeres con Propósito · mcp930.org"),
      "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + t("Mañana: " + item.nombre), "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = "evento-mcp930.ics";
    document.body.appendChild(a); a.click(); a.remove();
  }

  // Online events (Zoom, "En línea", a link…) have no address to open.
  function isOnlinePlace(text) {
    var t = String(text || "").trim().toLowerCase();
    return !t || /^https?:\/\//.test(t) || /\b(zoom|en l[ií]nea|online|google meet|meet|teams|virtual|youtube)\b/.test(t);
  }
  // Apple devices open Apple Maps; everything else opens Google Maps (app if installed).
  function mapsUrl(address) {
    var q = encodeURIComponent(String(address).trim());
    var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
    return apple ? "https://maps.apple.com/?q=" + q : "https://www.google.com/maps/search/?api=1&query=" + q;
  }

  function open(item) {
    var past = item.fechaEvento && new Date(item.fechaEvento) < new Date();
    var already = signed().indexOf(String(item.id)) !== -1;
    var root = document.createElement("div");
    root.className = "es-backdrop";
    root.innerHTML =
      '<div class="es-sheet" role="dialog" aria-modal="true" aria-labelledby="esTitle">' +
      '<button type="button" class="es-close" aria-label="Cerrar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>' +
      '<div class="es-head">' + (item.fotoUrl ? '<img src="' + esc(item.fotoUrl) + '" alt="">' : "") +
      '<div><span class="es-eyebrow">Evento especial</span><h3 id="esTitle">' + esc(item.nombre) + "</h3>" + (item.titulo ? "<p>" + esc(item.titulo) + "</p>" : "") + "</div></div>" +
      '<ul class="es-facts">' +
      (item.fechaEvento ? '<li><i class="fa-regular fa-calendar" aria-hidden="true"></i>' + esc(fmtDate(item.fechaEvento)) + "</li>" : "") +
      (item.lugar ? (isOnlinePlace(item.lugar)
        ? '<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i>' + esc(item.lugar) + "</li>"
        : '<li><i class="fa-solid fa-location-dot" aria-hidden="true"></i><a class="es-map-link" href="' + esc(mapsUrl(item.lugar)) + '" target="_blank" rel="noopener">' + esc(item.lugar) + ' <span>Abrir en Mapas <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></span></a></li>') : "") +
      '<li class="es-places" hidden><i class="fa-solid fa-user-group" aria-hidden="true"></i><span></span></li></ul>' +
      '<div class="es-body"></div></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add("es-lock");
    var body = root.querySelector(".es-body");
    var close = function () { root.remove(); document.documentElement.classList.remove("es-lock"); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    root.addEventListener("click", function (e) { if (e.target === root || e.target.closest(".es-close")) close(); });

    var full = false;
    var c = client();
    if (c) c.rpc("plazas_evento", { p_destacada: String(item.id) }).then(function (r) {
      var d = r.data; if (!d || d.cupo == null) return;
      var left = Math.max(0, d.cupo - d.ocupados);
      full = left === 0;
      var li = root.querySelector(".es-places");
      li.hidden = false;
      li.querySelector("span").textContent = full ? "Cupo completo" : left + (left === 1 ? " plaza disponible" : " plazas disponibles");
      if (full && !already) showDone("full");
    });

    function showDone(kind) {
      var msg = kind === "full" ? ["Cupo completo", "Ya no quedan plazas para este evento. Te esperamos en el próximo."]
        : kind === "past" ? ["Evento finalizado", "Este evento ya tuvo lugar."]
        : ["¡Estás inscrita!", "Te esperamos. Te enviaremos los detalles si hay cambios."];
      body.innerHTML = '<div class="es-done"><span class="es-done-icon' + (kind === "ok" ? " is-ok" : "") + '"><i class="fa-solid ' + (kind === "ok" ? "fa-check" : "fa-circle-info") + '" aria-hidden="true"></i></span>' +
        "<h4>" + msg[0] + "</h4><p>" + msg[1] + "</p>" +
        (kind === "ok" && item.fechaEvento ? '<button type="button" class="es-btn es-cal"><i class="fa-regular fa-calendar-plus" aria-hidden="true"></i> Añadir a mi calendario</button><small>Incluye un recordatorio 1 día antes.</small>' : "") + "</div>";
      var cal = body.querySelector(".es-cal");
      if (cal) cal.addEventListener("click", function () { ics(item); });
    }

    if (past) return showDone("past");
    if (already) return showDone("ok");

    body.innerHTML =
      '<form class="es-form" novalidate>' +
      '<label>Nombre completo<input name="nombre" autocomplete="name" required maxlength="120"></label>' +
      '<label>Correo electrónico<input name="email" type="email" autocomplete="email" required maxlength="160"></label>' +
      '<label><span>Teléfono <em>(opcional)</em></span><input name="telefono" type="tel" autocomplete="tel" maxlength="40"></label>' +
      '<div class="es-stepper"><span>Acompañantes</span><div><button type="button" data-step="-1" aria-label="Menos">−</button><output>0</output><button type="button" data-step="1" aria-label="Más">+</button></div></div>' +
      '<p class="es-error" role="alert" hidden></p>' +
      '<button type="submit" class="es-btn"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Confirmar inscripción</button>' +
      '<small class="es-note">Usaremos tus datos solo para este evento. <a href="privacidad.html">Privacidad</a></small></form>';
    var form = body.querySelector("form");
    var out = form.querySelector("output");
    var guests = 0;
    form.addEventListener("click", function (e) {
      var b = e.target.closest("[data-step]"); if (!b) return;
      guests = Math.max(0, Math.min(10, guests + Number(b.dataset.step)));
      out.textContent = guests;
    });
    form.querySelector("input").focus();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var err = form.querySelector(".es-error");
      var v = function (n) { return form.elements[n].value.trim(); };
      var fail = function (m) { err.textContent = m; err.hidden = false; };
      if (v("nombre").length < 2) return fail("Escribe tu nombre.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v("email"))) return fail("Escribe un correo válido.");
      if (!c) return fail("No se pudo conectar. Inténtalo de nuevo.");
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; err.hidden = true;
      c.rpc("inscribirse", { p_destacada: String(item.id), p_nombre: v("nombre"), p_email: v("email"), p_telefono: v("telefono"), p_acompanantes: guests })
        .then(function (r) {
          btn.disabled = false;
          if (r.error) return fail(r.error.message || "No se pudo completar la inscripción.");
          remember(String(item.id));
          showDone("ok");
        }, function () { btn.disabled = false; fail("No se pudo conectar. Inténtalo de nuevo."); });
    });
  }

  window.McpEventSignup = { open: open };
})();
