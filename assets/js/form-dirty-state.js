(function installFormDirtyState() {
  const states = new WeakMap();
  const formSelector = "#adminDashboard form, .admin-edit-modal form, #dashboardRecordForm";

  function readForm(form) {
    return Array.from(form.querySelectorAll("input, select, textarea, [contenteditable='true']"))
      .filter((field) => !field.disabled && field.type !== "button" && field.type !== "submit" && field.type !== "reset")
      .map((field) => {
        if (field.matches("[contenteditable='true']")) return [field.id || field.getAttribute("name") || "editor", field.innerHTML];
        if (field.type === "file") return [field.id || field.name, Array.from(field.files || []).map((file) => [file.name, file.size, file.lastModified])];
        if (field.type === "checkbox" || field.type === "radio") return [field.id || field.name, field.checked, field.value];
        if (field.tagName === "SELECT" && field.multiple) return [field.id || field.name, Array.from(field.selectedOptions).map((option) => option.value)];
        return [field.id || field.name, field.value];
      });
  }

  function saveButtons(form) {
    return Array.from(form.querySelectorAll("button[type='submit'], input[type='submit']"));
  }

  function sync(form) {
    const state = states.get(form);
    if (!state) return;
    const dirty = state.baseline !== null && JSON.stringify(readForm(form)) !== state.baseline;
    state.dirty = dirty;
    saveButtons(form).forEach((button) => {
      // Actions such as "Enviar a revisión" or "Publicar" are valid without
      // unsaved changes (e.g. resubmitting a draft saved a moment ago).
      button.disabled = state.submitting || (!dirty && !button.hasAttribute("data-dirty-ignore"));
      button.setAttribute("aria-disabled", String(button.disabled));
    });
  }

  function capture(form) {
    // Forms added a moment ago (edit modals) may not be registered yet.
    if (!states.has(form)) init();
    const state = states.get(form);
    if (!state) return;
    if (state.wasHidden && !form.closest("[hidden]")) {
      state.baseline = JSON.stringify(readForm(form));
      state.submitting = false;
      state.wasHidden = false;
      sync(form);
      return;
    }
    if (form.closest("[hidden]") || state.baseline !== null) return;
    state.baseline = JSON.stringify(readForm(form));
    sync(form);
  }

  function markSaved(form) {
    const state = form && states.get(form);
    if (!state) return;
    state.baseline = JSON.stringify(readForm(form));
    state.submitting = false;
    sync(form);
  }

  function markFailed(form) {
    const state = form && states.get(form);
    if (!state) return;
    state.submitting = false;
    sync(form);
  }

  function begin(form) {
    const state = form && states.get(form);
    if (!state) return;
    capture(form);
    state.submitting = true;
    sync(form);
  }

  function init() {
    document.querySelectorAll(formSelector).forEach((form) => {
      if (!saveButtons(form).length || states.has(form)) return;
      states.set(form, { baseline: null, submitting: false, dirty: false, wasHidden: Boolean(form.closest("[hidden]")) });
      sync(form);

      form.addEventListener("reset", () => {
        window.setTimeout(() => markSaved(form), 0);
      });
      // React to a status message once, when it appears or changes. A message
      // that simply stays on screen must not re-mark the form as saved on every
      // later edit (typing in a rich editor mutates the form subtree).
      let lastMessage = "";
      const observer = new MutationObserver(() => {
        const message = form.querySelector(".form-message:not([hidden])");
        const visible = message && message.textContent.trim() && getComputedStyle(message).display !== "none";
        const signature = visible ? `${message.className}|${message.textContent.trim()}` : "";
        if (signature === lastMessage) return;
        lastMessage = signature;
        if (!visible || message.classList.contains("is-progress")) return;
        if (message.classList.contains("ok")) markSaved(form);
        else if (message.classList.contains("err")) markFailed(form);
      });
      observer.observe(form, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    });
  }

  // Take the baseline before any interaction. Safari does not focus file
  // inputs (or buttons) on click, so focusin alone missed the moment before a
  // photo was picked and "Guardar" stayed disabled.
  document.addEventListener("pointerdown", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) capture(form);
  }, true);
  document.addEventListener("keydown", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) capture(form);
  }, true);

  document.addEventListener("focusin", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) capture(form);
  }, true);

  document.addEventListener("click", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form && event.target.closest("button:not([type='submit']), [contenteditable='true'], .admin-image-dropzone, .admin-file-dropzone, .admin-gallery-dropzone, .admin-dropzone")) {
      capture(form);
      window.setTimeout(() => sync(form), 0);
    }
  }, true);

  // Capture phase on document runs before the form's own submit handlers, so a
  // synchronous markFailed() from validation is not overwritten by begin().
  document.addEventListener("submit", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form && states.has(form)) begin(form);
  }, true);

  document.addEventListener("input", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) sync(form);
  }, true);
  document.addEventListener("change", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) sync(form);
  }, true);
  document.addEventListener("drop", (event) => {
    const form = event.target.closest?.(formSelector);
    if (form) capture(form);
  }, true);

  window.McpFormDirty = { sync, begin, markSaved, markFailed, init };
  const start = () => {
    init();
    new MutationObserver((records) => {
      init();
      if (records.some((record) => record.type === "attributes" && record.attributeName === "hidden")) {
        document.querySelectorAll(formSelector).forEach((form) => {
          const state = states.get(form);
          if (state && form.closest("[hidden]")) state.wasHidden = true;
        });
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
