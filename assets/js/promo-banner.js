// Banner promocional flotante: aparece solo a los pocos segundos y se
// desvanece automáticamente. Contenido gestionado desde el admin (tabla
// site_banner en Supabase). Se muestra una sola vez por sesión de navegador.
(function () {
  var STORAGE_KEY = "mcpPromoBannerSeen";
  var SHOW_DELAY_MS = 2000;
  var VISIBLE_MS = 12000;
  var FADE_MS = 500;

  function escapeHtml(value) {
    var node = document.createElement("div");
    node.textContent = String(value || "");
    return node.innerHTML;
  }

  function showBanner(titulo, mensaje) {
    var banner = document.createElement("div");
    banner.className = "promo-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.style.setProperty("--promo-duration", VISIBLE_MS + "ms");
    banner.innerHTML =
      '<button type="button" class="promo-banner-close" aria-label="Cerrar aviso">&times;</button>' +
      '<div class="promo-banner-icon"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i></div>' +
      '<div class="promo-banner-text">' +
      '<small class="promo-banner-eyebrow">Mujeres con Propósito</small>' +
      (titulo ? "<strong>" + escapeHtml(titulo) + "</strong>" : "") +
      (mensaje ? "<span>" + escapeHtml(mensaje) + "</span>" : "") +
      "</div>" +
      '<div class="promo-banner-progress" aria-hidden="true"><i></i></div>';

    document.body.appendChild(banner);

    // The countdown only runs while the banner is actually seen: it starts
    // once the tab is visible and pauses on hover/focus or when the tab is
    // hidden, so nobody misses it by opening the site in a background tab.
    var remaining = VISIBLE_MS;
    var startedAt = 0;
    var hideTimer = null;
    var hovering = false;
    var dismissed = false;

    function running() { return hideTimer !== null; }
    function pause() {
      if (!running()) return;
      clearTimeout(hideTimer);
      hideTimer = null;
      remaining -= Date.now() - startedAt;
      banner.classList.add("is-paused");
    }
    function resume() {
      if (dismissed || running() || hovering || document.hidden || !banner.classList.contains("show")) return;
      startedAt = Date.now();
      banner.classList.remove("is-paused");
      hideTimer = setTimeout(dismiss, Math.max(remaining, 0));
    }

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      if (hideTimer) clearTimeout(hideTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      banner.classList.remove("show");
      banner.classList.add("hide");
      setTimeout(function () {
        banner.remove();
      }, FADE_MS);
      try {
        sessionStorage.setItem(STORAGE_KEY, "1");
      } catch (e) {
        /* ignorar */
      }
    }

    function onVisibility() { if (document.hidden) pause(); else resume(); }

    banner.querySelector(".promo-banner-close").addEventListener("click", dismiss);
    banner.addEventListener("mouseenter", function () { hovering = true; pause(); });
    banner.addEventListener("mouseleave", function () { hovering = false; resume(); });
    banner.addEventListener("focusin", function () { hovering = true; pause(); });
    banner.addEventListener("focusout", function () { hovering = false; resume(); });
    document.addEventListener("visibilitychange", onVisibility);

    function reveal() {
      if (document.hidden) {
        document.addEventListener("visibilitychange", function once() {
          if (document.hidden) return;
          document.removeEventListener("visibilitychange", once);
          setTimeout(reveal, 600);
        });
        return;
      }
      banner.classList.add("show", "is-paused");
      resume();
    }
    setTimeout(reveal, SHOW_DELAY_MS);
  }

  async function init() {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
    } catch (e) {
      /* sessionStorage no disponible: seguimos igual */
    }

    var client = window.McpSupabase && window.McpSupabase.getSupabaseBrowserClient();
    if (!client) return;

    try {
      var result = await client
        .from("site_banner")
        .select("titulo,mensaje,activa")
        .eq("id", 1)
        .maybeSingle();
      var data = result.data;
      if (result.error || !data || !data.activa) return;
      var titulo = (data.titulo || "").trim();
      var mensaje = (data.mensaje || "").trim();
      if (!titulo && !mensaje) return;
      showBanner(titulo, mensaje);
    } catch (e) {
      /* si falla la carga, no mostramos nada */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
