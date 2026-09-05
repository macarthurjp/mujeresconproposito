(function setupPromoBannerAdmin() {
  let initialized = false;

  const $ = (id) => document.getElementById(id);

  function client() {
    const value = window.McpSupabase?.getSupabaseBrowserClient();
    if (!value) throw new Error("Supabase no está disponible.");
    return value;
  }

  function message(text, ok = true) {
    const element = $("adminBannerMsg");
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${ok ? "ok" : "err"}`;
    element.style.display = "block";
  }

  async function load() {
    try {
      const { data, error } = await client()
        .from("site_banner")
        .select("titulo,mensaje,activa")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      if ($("adminBannerTitulo")) $("adminBannerTitulo").value = data?.titulo || "";
      if ($("adminBannerMensaje")) $("adminBannerMensaje").value = data?.mensaje || "";
      if ($("adminBannerActiva")) $("adminBannerActiva").checked = Boolean(data?.activa);
    } catch (error) {
      message(error?.message || "No se pudo cargar el banner.", false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const { error } = await client()
        .from("site_banner")
        .update({
          titulo: $("adminBannerTitulo").value.trim(),
          mensaje: $("adminBannerMensaje").value.trim(),
          activa: $("adminBannerActiva").checked,
          updated_at: new Date().toISOString()
        })
        .eq("id", 1);
      if (error) throw error;
      message("Banner guardado.");
    } catch (error) {
      message(error?.message || "No se pudo guardar el banner.", false);
    } finally {
      if (button) button.disabled = false;
    }
  }

  window.initPromoBannerAdmin = async function initPromoBannerAdmin(access) {
    if (!access?.is_super_admin) return;
    if (!initialized) {
      initialized = true;
      $("adminBannerForm")?.addEventListener("submit", save);
    }
    await load();
  };
})();
