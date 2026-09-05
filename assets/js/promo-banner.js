// Banner promocional flotante: aparece solo a los pocos segundos y se
// desvanece automáticamente. Contenido gestionado desde el admin (tabla
// site_banner en Supabase). Se muestra una sola vez por sesión de navegador.
(function () {
  var STORAGE_KEY = "mcpPromoBannerSeen";
  var SHOW_DELAY_MS = 2000;
  var VISIBLE_MS = 7000;
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
    banner.innerHTML =
      '<button type="button" class="promo-banner-close" aria-label="Cerrar promoción">&times;</button>' +
      '<div class="promo-banner-icon"><i class="fa-solid fa-bullhorn" aria-hidden="true"></i></div>' +
      '<div class="promo-banner-text">' +
      "<strong>" + escapeHtml(titulo) + "</strong>" +
      "<span>" + escapeHtml(mensaje) + "</span>" +
      "</div>";

    document.body.appendChild(banner);

    var hideTimer = null;

    function dismiss() {
      if (hideTimer) clearTimeout(hideTimer);
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

    banner.querySelector(".promo-banner-close").addEventListener("click", dismiss);

    setTimeout(function () {
      banner.classList.add("show");
      hideTimer = setTimeout(dismiss, VISIBLE_MS);
    }, SHOW_DELAY_MS);
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
