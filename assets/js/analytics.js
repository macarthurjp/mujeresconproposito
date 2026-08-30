(function () {
  "use strict";

  const MEASUREMENT_ID = "G-Y4EMQGHWVQ";
  const CONSENT_KEY = "mcp930-analytics-consent";

  function loadGoogleAnalytics() {
    if (document.querySelector(`script[data-ga-id="${MEASUREMENT_ID}"]`)) return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, { anonymize_ip: true });

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
    script.dataset.gaId = MEASUREMENT_ID;
    document.head.appendChild(script);
  }

  function setConsent(value) {
    localStorage.setItem(CONSENT_KEY, value);
    document.getElementById("analyticsConsentBanner")?.remove();
    if (value === "granted") loadGoogleAnalytics();
  }

  function showConsentBanner() {
    if (document.getElementById("analyticsConsentBanner")) return;

    const style = document.createElement("style");
    style.textContent = `
      .analytics-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:100000;max-width:760px;margin:auto;padding:18px 20px;border:1px solid rgba(166,75,67,.18);border-radius:22px;background:rgba(255,250,248,.98);box-shadow:0 20px 60px rgba(74,39,32,.2);color:#493532;font-family:Inter,Arial,sans-serif}
      .analytics-consent p{margin:0 0 14px;font-size:.92rem;line-height:1.55;text-align:left}
      .analytics-consent-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
      .analytics-consent button{min-height:42px;padding:0 18px;border-radius:999px;border:1px solid rgba(166,75,67,.22);font-weight:800;cursor:pointer}
      .analytics-consent-reject{background:#fff;color:#7b4945}
      .analytics-consent-accept{background:#9d433d;color:#fff}
      @media(max-width:520px){.analytics-consent{left:10px;right:10px;bottom:10px;padding:16px}.analytics-consent-actions{display:grid;grid-template-columns:1fr 1fr}.analytics-consent button{width:100%}}
    `;
    document.head.appendChild(style);

    const banner = document.createElement("aside");
    banner.id = "analyticsConsentBanner";
    banner.className = "analytics-consent";
    banner.setAttribute("aria-label", "Preferencias de analítica");
    banner.innerHTML = `
      <p>Usamos Google Analytics para conocer de forma anónima cómo se visita el sitio y mejorar la experiencia. Puedes aceptar o rechazar estas cookies.</p>
      <div class="analytics-consent-actions">
        <button type="button" class="analytics-consent-reject">Rechazar</button>
        <button type="button" class="analytics-consent-accept">Aceptar analítica</button>
      </div>
    `;
    banner.querySelector(".analytics-consent-reject").addEventListener("click", () => setConsent("denied"));
    banner.querySelector(".analytics-consent-accept").addEventListener("click", () => setConsent("granted"));
    document.body.appendChild(banner);
  }

  window.mcpTrackAnalytics = function (eventName, parameters) {
    if (localStorage.getItem(CONSENT_KEY) !== "granted" || typeof window.gtag !== "function") return;
    window.gtag("event", eventName, { transport_type: "beacon", ...(parameters || {}) });
  };

  document.addEventListener("click", function (event) {
    const link = event.target.closest("a");
    if (!link) return;
    if (link.matches(".whatsapp-float")) window.mcpTrackAnalytics("select_content", { content_type: "social", item_id: "whatsapp" });
    if (link.closest(".social-follow")) window.mcpTrackAnalytics("select_content", { content_type: "social", item_id: link.getAttribute("aria-label") || "social" });
  });

  document.addEventListener("DOMContentLoaded", function () {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === "granted") loadGoogleAnalytics();
    else if (consent !== "denied") showConsentBanner();
  });
})();
