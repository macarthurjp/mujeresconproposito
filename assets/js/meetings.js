// Reuniones (web): next-meeting hero, week strip and day agenda — mirrors the
// app's Reuniones tab. main.js hands the Supabase rows to MCPMeetings.render().
(function () {
  "use strict";

  var LIVE_MS = 90 * 60000;
  var events = [];
  var selected = 0;
  var timer = null;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function time(d) { return new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d); }
  function safeLink(link) { return /^https?:\/\//i.test(String(link || "")) ? String(link) : ""; }

  function platform(link) {
    var host = "";
    try { host = new URL(link).hostname; } catch (_) { return null; }
    if (host.indexOf("meet.google") !== -1) return "Google Meet";
    if (host.indexOf("zoom") !== -1) return "Zoom";
    if (host.indexOf("teams") !== -1) return "Teams";
    if (host.indexOf("youtu") !== -1) return "YouTube";
    if (host.indexOf("whatsapp") !== -1) return "WhatsApp";
    return "la sala";
  }

  function relative(d, now) {
    var mins = Math.round((d - now) / 60000);
    if (mins < 60) return "En " + Math.max(1, mins) + " min";
    var hours = Math.round(mins / 60);
    if (hours < 24) return "En " + hours + " h";
    return cap(new Intl.DateTimeFormat("es", { weekday: "long" }).format(d));
  }

  function dayLabel(d, now) {
    var diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
    if (diff === 0) return "Hoy";
    if (diff === 1) return "Mañana";
    return cap(new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(d));
  }

  function icon(ev) {
    var value = String(ev.icono || "").trim();
    if (/^https?:\/\//i.test(value)) return '<img src="' + esc(value) + '" alt="" loading="lazy" />';
    if (value.indexOf("ion:") === 0) {
      var names = {
        "calendar-outline": "fa-calendar-days", "people-outline": "fa-people-group", "book-outline": "fa-book-open",
        "heart-outline": "fa-heart", "hand-left-outline": "fa-hands-praying", "business-outline": "fa-church",
        "chatbubble-ellipses-outline": "fa-comments", "musical-notes-outline": "fa-music", "mic-outline": "fa-microphone",
        "headset-outline": "fa-headphones", "sparkles-outline": "fa-wand-magic-sparkles", "leaf-outline": "fa-leaf",
        "flower-outline": "fa-spa", "sunny-outline": "fa-sun", "moon-outline": "fa-moon", "star-outline": "fa-star",
        "flame-outline": "fa-fire", "home-outline": "fa-house", "globe-outline": "fa-globe", "notifications-outline": "fa-bell",
        "camera-outline": "fa-camera", "videocam-outline": "fa-video", "gift-outline": "fa-gift"
      };
      var className = names[value.slice(4)] || "fa-calendar-days";
      return '<i class="fa-solid ' + className + ' mt-platform-icon" aria-hidden="true"></i>';
    }
    return "<span>" + esc(value || "✦") + "</span>";
  }

  function recurrence(ev) { return String(ev.horario || "").split("·")[0].trim(); }

  function occurrences(now) {
    var S = window.MCPSchedule;
    if (!S) return [];
    var from = startOfDay(now);
    var list = [];
    events.forEach(function (ev) {
      S.occurrences(ev, new Date(from.getTime() - LIVE_MS), 8).forEach(function (start) {
        list.push({ ev: ev, start: start, live: start <= now && now - start < LIVE_MS });
      });
    });
    return list.sort(function (a, b) { return a.start - b.start; });
  }

  function joinButton(ev, live, compact) {
    var link = safeLink(ev.link);
    if (!link) return "";
    var name = platform(link);
    var label = live ? "Unirme ahora por " + name : "Unirme por " + name;
    if (compact) {
      return '<a class="mt-join-round' + (live ? " is-live" : "") + '" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(label + " a " + ev.titulo) + '"><i class="fa-solid fa-video" aria-hidden="true"></i></a>';
    }
    return '<a class="mt-join" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-video" aria-hidden="true"></i> ' + esc(label) + "</a>";
  }

  function render() {
    var root = document.getElementById("meetingsApp");
    if (!root) return;
    var now = new Date();
    var all = occurrences(now);
    var upcoming = all.filter(function (o) { return o.live || o.start >= now; });
    upcoming.sort(function (a, b) { return Number(b.live) - Number(a.live) || a.start - b.start; });
    var hero = upcoming[0];
    var today = startOfDay(now);
    var selectedDay = addDays(today, selected);
    var dayItems = all.filter(function (o) { return startOfDay(o.start).getTime() === selectedDay.getTime(); });

    if (!events.length) {
      root.innerHTML = '<div class="mt-empty"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Pronto publicaremos nuevas reuniones.</div>';
      return;
    }

    var heroHtml = hero ? (
      '<article class="mt-hero' + (hero.live ? " is-live" : "") + '">' +
        '<div class="mt-hero-top"><span class="mt-badge">' + (hero.live ? '<span class="mt-live-dot"></span> En vivo ahora' : '<i class="fa-regular fa-clock" aria-hidden="true"></i> Próxima reunión') + "</span>" +
        '<span class="mt-hero-art">' + icon(hero.ev) + "</span></div>" +
        '<h3 class="mt-hero-title">' + esc(String(hero.ev.titulo || "Reunión").trim()) + "</h3>" +
        '<div class="mt-hero-when"><span class="mt-hero-time">' + time(hero.start) + "</span><span><strong>" + esc(dayLabel(hero.start, now)) + "</strong><small>" + esc(hero.live ? "La reunión ya comenzó" : relative(hero.start, now)) + "</small></span></div>" +
        joinButton(hero.ev, hero.live, false) +
      "</article>"
    ) : "";

    var weekHtml = "";
    for (var i = 0; i < 7; i += 1) {
      var d = addDays(today, i);
      var has = all.some(function (o) { return startOfDay(o.start).getTime() === d.getTime(); });
      var name = new Intl.DateTimeFormat("es", { weekday: "short" }).format(d).replace(".", "").slice(0, 3).toUpperCase();
      weekHtml += '<button type="button" role="tab" class="mt-day' + (i === selected ? " is-on" : "") + (i === 0 ? " is-today" : "") + '" data-mt-day="' + i + '" aria-selected="' + (i === selected) + '" aria-label="' + esc(new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric" }).format(d)) + '">' +
        "<span>" + name + "</span><strong>" + d.getDate() + '</strong><i class="mt-dot' + (has ? "" : " is-empty") + '"></i></button>';
    }

    var listHtml = dayItems.length ? dayItems.map(function (o) {
      var past = !o.live && o.start < now;
      var sub = o.live ? "En vivo" : past ? "Terminó" : (relative(o.start, now).indexOf("En ") === 0 ? relative(o.start, now) : "");
      return '<div class="mt-row' + (o.live ? " is-live" : "") + (past ? " is-past" : "") + '">' +
        '<div class="mt-row-time"><strong>' + time(o.start) + "</strong><small>" + esc(sub) + "</small></div>" +
        '<span class="mt-row-rule"></span>' +
        '<span class="mt-row-art">' + icon(o.ev) + "</span>" +
        '<div class="mt-row-copy"><strong>' + esc(String(o.ev.titulo || "Reunión").trim()) + "</strong><small>" + esc(recurrence(o.ev)) + "</small></div>" +
        (past ? "" : joinButton(o.ev, o.live, true)) +
      "</div>";
    }).join("") : '<div class="mt-empty"><i class="fa-solid fa-mug-hot" aria-hidden="true"></i> No hay reuniones este día. Descansa y vuelve pronto.</div>';

    root.innerHTML =
      '<div class="mt-grid">' +
        '<div class="mt-col-hero">' + heroHtml + "</div>" +
        '<div class="mt-col-agenda">' +
          '<div class="mt-week-head"><h3>Esta semana</h3></div>' +
          '<div class="mt-week" role="tablist">' + weekHtml + "</div>" +
          '<h4 class="mt-day-title">' + esc(dayLabel(selectedDay, now)) + "</h4>" +
          '<div class="mt-list">' + listHtml + "</div>" +
        "</div>" +
      "</div>";
  }

  // ---------- Floating "EN VIVO AHORA" banner (same as the app) ----------
  var DISMISS_KEY = "mcp-live-dismissed";
  function dismissedKeys() {
    try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]"); } catch (_) { return []; }
  }
  function renderLiveBanner() {
    var now = new Date();
    var live = occurrences(now).filter(function (o) { return o.live && safeLink(o.ev.link); })
      .find(function (o) { return dismissedKeys().indexOf(o.ev.id + "@" + o.start.toISOString()) === -1; });
    var bar = document.getElementById("mtLiveBanner");
    if (!live) { if (bar) bar.remove(); return; }
    var key = live.ev.id + "@" + live.start.toISOString();
    if (bar && bar.getAttribute("data-key") === key) return;
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "mtLiveBanner";
      bar.className = "mt-live-banner";
      bar.setAttribute("role", "status");
      document.body.appendChild(bar);
    }
    bar.setAttribute("data-key", key);
    bar.innerHTML =
      '<span class="mt-live-pulse" aria-hidden="true"><i></i></span>' +
      '<span class="mt-live-copy"><small>En vivo ahora</small><strong>' + esc(String(live.ev.titulo || "Reunión").trim()) + "</strong></span>" +
      '<a class="mt-live-join" href="' + esc(safeLink(live.ev.link)) + '" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-video" aria-hidden="true"></i> Unirme</a>' +
      '<button type="button" class="mt-live-close" aria-label="Cerrar aviso"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>';
    bar.querySelector(".mt-live-close").addEventListener("click", function () {
      var keys = dismissedKeys(); keys.push(key);
      try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify(keys)); } catch (_) {}
      bar.remove();
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-mt-day]");
    if (!button) return;
    selected = Number(button.getAttribute("data-mt-day")) || 0;
    render();
  });

  window.MCPMeetings = {
    render: function (rows) {
      events = (rows || []).filter(function (row) { return row && row.activa !== false; });
      render();
      renderLiveBanner();
      if (!timer) timer = setInterval(function () { render(); renderLiveBanner(); }, 30000);
    }
  };
})();
