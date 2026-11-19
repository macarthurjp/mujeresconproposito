// Admin: enable confetti on a special date (table site_confetti).
(function setupConfettiAdmin() {
  let initialized = false;
  const $ = (id) => document.getElementById(id);
  const LIB = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.js";

  function client() {
    const value = window.McpSupabase?.getSupabaseBrowserClient();
    if (!value) throw new Error("Supabase no está disponible.");
    return value;
  }

  function message(text, ok = true) {
    const el = $("adminConfettiMsg");
    if (!el) return;
    el.textContent = text;
    el.className = `form-message ${ok ? "ok" : "err"}`;
    el.style.display = "block";
  }

  function loadLibrary() {
    return new Promise((resolve, reject) => {
      if (window.confetti) return resolve(window.confetti);
      const script = document.createElement("script");
      script.src = LIB;
      script.onload = () => (window.confetti ? resolve(window.confetti) : reject(new Error("confetti")));
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function tryIt() {
    try {
      const confetti = await loadLibrary();
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, colors: ["#a64b43", "#e7a8a0", "#c9a46b", "#f9e4e0", "#ffffff"], disableForReducedMotion: true, zIndex: 2500 });
    } catch {
      message("No se pudo cargar la vista previa.", false);
    }
  }

  async function load() {
    try {
      const { data, error } = await client().from("site_confetti").select("activa,fecha,mensaje").eq("id", 1).maybeSingle();
      if (error) throw error;
      $("adminConfettiActiva").checked = Boolean(data?.activa);
      $("adminConfettiFecha").value = data?.fecha || "";
      $("adminConfettiMensaje").value = data?.mensaje || "";
      window.McpFormDirty?.markSaved($("adminConfettiForm"));
    } catch (error) {
      message(error?.message || "No se pudo cargar la celebración.", false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const activa = $("adminConfettiActiva").checked;
    const fecha = $("adminConfettiFecha").value || null;
    if (activa && !fecha) {
      message("Elige la fecha de la celebración.", false);
      window.McpFormDirty?.markFailed(event.target);
      return;
    }
    try {
      const { error } = await client().from("site_confetti").update({
        activa, fecha, mensaje: $("adminConfettiMensaje").value.trim(), updated_at: new Date().toISOString()
      }).eq("id", 1);
      if (error) throw error;
      message(activa ? `Confeti programado para el ${new Date(fecha + "T12:00:00").toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" })}.` : "Confeti desactivado.");
    } catch (error) {
      message(error?.message || "No se pudo guardar.", false);
    }
  }

  window.initConfettiAdmin = async function initConfettiAdmin() {
    if (!$("adminConfettiForm")) return;
    if (!initialized) {
      initialized = true;
      $("adminConfettiForm").addEventListener("submit", save);
      $("adminConfettiTry")?.addEventListener("click", tryIt);
    }
    await load();
  };
})();
