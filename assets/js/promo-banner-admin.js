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

  function syncPreview() {
    const title = ($("adminBannerTitulo")?.value || "").trim();
    const body = ($("adminBannerMensaje")?.value || "").trim();
    const active = Boolean($("adminBannerActiva")?.checked);
    const titlePreview = $("adminBannerPreviewTitle");
    const bodyPreview = $("adminBannerPreviewMessage");
    const state = $("adminBannerPreviewState");
    if (titlePreview) titlePreview.textContent = title || "Tu título aparecerá aquí";
    if (bodyPreview) bodyPreview.textContent = body || "Escribe un mensaje breve para invitar a la comunidad.";
    if (state) {
      state.classList.toggle("is-active", active);
      state.innerHTML = `<i aria-hidden="true"></i> ${active ? "Activo" : "Inactivo"}`;
    }
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
      syncPreview();
      window.McpFormDirty?.markSaved($("adminBannerForm"));
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
      if (window.McpFormDirty) window.McpFormDirty.sync(event.target);
      else if (button) button.disabled = false;
    }
  }

  window.initPromoBannerAdmin = async function initPromoBannerAdmin(access) {
    if (!access?.is_super_admin && !window.McpAdminPerms?.can("content", "edit")) return;
    if (!initialized) {
      initialized = true;
      $("adminBannerForm")?.addEventListener("submit", save);
      $("adminBannerForm")?.addEventListener("input", syncPreview);
      $("adminBannerForm")?.addEventListener("change", syncPreview);
    }
    await load();
    await window.initConfettiAdmin?.(access);
  };
})();
