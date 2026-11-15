// Cleaner private login (admin + dashboard): show only the Face ID option that
// makes sense on this device, and turn "Cancelar" into a discreet back link.
(function () {
  "use strict";
  async function polish() {
    const api = window.McpPasskeyAuth;
    const supported = api ? await api.isAvailable().catch(() => false) : false;
    const enrolled = !!(api && api.getStoredCredential && api.getStoredCredential());
    document.querySelectorAll(".private-passkey-actions").forEach((group) => {
      const use = group.querySelector('[id$="UsePasskeyBtn"]');
      const enroll = group.querySelector('[id$="EnrollPasskeyBtn"]');
      if (use) use.hidden = !(supported && enrolled);
      if (enroll) {
        enroll.hidden = !(supported && !enrolled);
        enroll.textContent = "Entrar y activar Face ID / huella";
        enroll.classList.add("private-link-like");
      }
      group.hidden = (!use || use.hidden) && (!enroll || enroll.hidden);
      group.classList.toggle("is-single", [use, enroll].filter((b) => b && !b.hidden).length === 1);
    });
    document.querySelectorAll('[id$="CancelBtn"].private-cancel-btn').forEach((btn) => {
      btn.innerHTML = '<span aria-hidden="true">‹</span> Volver al inicio';
      btn.classList.add("private-back-link");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", polish);
  else polish();
})();
