(function initializeMcpSocialAuth() {
  const PENDING_KEY = "mcp-social-login-pending";
  const PENDING_TTL = 10 * 60 * 1000;

  function markPending() {
    try { sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch (_) { /* Browser may block storage. */ }
  }

  function consumePending() {
    try {
      const timestamp = Number(sessionStorage.getItem(PENDING_KEY));
      sessionStorage.removeItem(PENDING_KEY);
      return Number.isFinite(timestamp) && Date.now() - timestamp >= 0 && Date.now() - timestamp < PENDING_TTL;
    } catch (_) { return false; }
  }

  function showCallbackError() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const message = query.get("error_description") || hash.get("error_description") || query.get("error") || hash.get("error");
    if (!message) return;
    const target = document.getElementById("adminLoginMsg") || document.getElementById("dashboardLoginMsg");
    if (target) {
      target.className = "form-message err";
      target.textContent = message.replaceAll("+", " ");
      target.style.display = "block";
    }
    query.delete("error"); query.delete("error_description"); query.delete("error_code");
    const search = query.toString();
    window.history.replaceState({}, document.title, `${window.location.pathname}${search ? `?${search}` : ""}`);
  }

  async function signIn(client, provider, button, onError) {
    if (!client || !button || button.disabled) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = '<span class="social-login-spinner" aria-hidden="true"></span>Conectando…';
    try {
      const redirect = new URL(window.location.href);
      redirect.search = "";
      redirect.hash = "";
      markPending();
      const { error } = await client.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: redirect.toString(),
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {})
        }
      });
      if (error) throw error;
    } catch (error) {
      try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* Ignore unavailable storage. */ }
      button.disabled = false;
      button.classList.remove("is-loading");
      button.innerHTML = original;
      onError?.(error?.message || "No se pudo iniciar sesión con este proveedor.");
    }
  }

  async function authorizeReturnedUser(client, access) {
    if (!consumePending()) return;
    const permissions = Array.isArray(access?.permissions) ? access.permissions : [];
    const authorized = !access?.is_revoked && (Boolean(access?.is_super_admin) || permissions.some((permission) => permission !== "read_only"));
    if (authorized) return;
    await client.auth.signOut();
    throw new Error("Esta cuenta no tiene permisos para el panel privado.");
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (_) { /* Ignore unavailable storage. */ }
  }

  // Show Apple/Google buttons only for providers enabled in Supabase Auth;
  // otherwise the OAuth redirect lands on a raw "provider is not enabled" page.
  async function hideDisabledProviders() {
    const groups = document.querySelectorAll(".social-login-actions");
    if (!groups.length) return;
    const setVisible = (el, on) => { if (el) el.hidden = !on; };
    groups.forEach((g) => { setVisible(g, false); setVisible(g.previousElementSibling?.classList.contains("social-login-divider") ? g.previousElementSibling : null, false); });
    try {
      const base = window.McpSupabase?.SUPABASE_URL || "https://jkunywiyiyidhyodsbfh.supabase.co";
      const key = window.McpSupabase?.SUPABASE_ANON_KEY || "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
      const response = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } });
      const external = (await response.json())?.external || {};
      groups.forEach((g) => {
        let any = false;
        g.querySelectorAll(".social-login-apple").forEach((b) => { setVisible(b, !!external.apple); any = any || !!external.apple; });
        g.querySelectorAll(".social-login-google").forEach((b) => { setVisible(b, !!external.google); any = any || !!external.google; });
        setVisible(g, any);
        const divider = g.previousElementSibling;
        if (divider?.classList.contains("social-login-divider")) setVisible(divider, any);
      });
    } catch (_) { /* Keep them hidden if the check fails. */ }
  }

  window.McpSocialAuth = { signIn, authorizeReturnedUser, clearPending };
  showCallbackError();
  hideDisabledProviders();
})();
