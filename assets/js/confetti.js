// Confetti on a special date chosen in the admin (table site_confetti).
// Runs every time the home page opens on that day (Europe/Luxembourg), for a
// few seconds, never blocks clicks and respects "reduce motion".
(function () {
  var LIB = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js";
  var DURATION_MS = 3800;
  var COLORS = ["#a64b43", "#e7a8a0", "#c9a46b", "#f9e4e0", "#ffffff"];

  function todayInLuxembourg() {
    // en-CA formats as YYYY-MM-DD, the same shape as a Postgres date.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Luxembourg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function loadLibrary() {
    return new Promise(function (resolve, reject) {
      if (window.confetti) return resolve(window.confetti);
      var script = document.createElement("script");
      script.src = LIB;
      script.async = true;
      script.onload = function () { window.confetti ? resolve(window.confetti) : reject(new Error("confetti")); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function showMessage(text) {
    if (!text) return;
    var pill = document.createElement("div");
    pill.className = "celebration-pill";
    pill.setAttribute("role", "status");
    pill.textContent = text;
    document.body.appendChild(pill);
    requestAnimationFrame(function () { pill.classList.add("show"); });
    setTimeout(function () { pill.classList.remove("show"); setTimeout(function () { pill.remove(); }, 500); }, DURATION_MS + 1500);
  }

  function celebrate(confetti, message) {
    var end = Date.now() + DURATION_MS;
    confetti({ particleCount: 90, spread: 80, startVelocity: 42, origin: { y: 0.35 }, colors: COLORS, disableForReducedMotion: true, zIndex: 2500 });
    (function frame() {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: COLORS, disableForReducedMotion: true, zIndex: 2500 });
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: COLORS, disableForReducedMotion: true, zIndex: 2500 });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    showMessage(message);
  }

  async function init() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var client = window.McpSupabase && window.McpSupabase.getSupabaseBrowserClient();
    if (!client) return;
    try {
      var result = await client.from("site_confetti").select("activa,fecha,mensaje").eq("id", 1).maybeSingle();
      var data = result.data;
      if (result.error || !data || !data.activa || data.fecha !== todayInLuxembourg()) return;
      var confetti = await loadLibrary();
      // Let the page paint first so the celebration doesn't compete with loading.
      setTimeout(function () { celebrate(confetti, (data.mensaje || "").trim()); }, 600);
    } catch (e) {
      /* no celebration if anything fails */
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
