// Admin shell: sidebar navigation, section title, mobile drawer and switch
// helpers. Presentation only; all data logic stays in main.js.
(function () {
  "use strict";

  var sidebar = document.getElementById("adminSidebar");
  var backdrop = document.getElementById("adminSidebarBackdrop");
  var toggle = document.getElementById("adminMenuToggle");
  var title = document.getElementById("adminSectionTitle");

  function setDrawer(open) {
    if (!sidebar) return;
    document.body.classList.toggle("admin-drawer-open", open);
    if (backdrop) backdrop.hidden = !open;
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncTitle() {
    var active = document.querySelector(".admin-tab.active:not([hidden])") || document.querySelector(".admin-tab:not([hidden])");
    var label = active && active.querySelector("span");
    if (title && label) title.textContent = label.textContent.trim();
  }

  toggle && toggle.addEventListener("click", function () {
    setDrawer(!document.body.classList.contains("admin-drawer-open"));
  });
  backdrop && backdrop.addEventListener("click", function () { setDrawer(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setDrawer(false);
  });

  document.querySelectorAll(".admin-tab").forEach(function (tab) {
    tab.setAttribute("role", "tab");
    tab.addEventListener("click", function () {
      // main.js switches the panel; we only update chrome around it.
      setTimeout(syncTitle, 0);
      setDrawer(false);
      var main = document.querySelector(".admin-main");
      if (main) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // Role-based visibility (editors see only Devocionales) is applied after login.
  new MutationObserver(syncTitle).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  syncTitle();

  // Switches inside forms keep a hidden "true"/"false" input in sync.
  document.addEventListener("change", function (event) {
    var input = event.target;
    if (!input.matches || !input.matches("[data-switch-for]")) return;
    var field = input.closest(".admin-switch-field");
    var hidden = field && field.querySelector('input[type="hidden"][name="' + input.dataset.switchFor + '"]');
    if (hidden) hidden.value = input.checked ? "true" : "false";
    var state = field && field.querySelector("[data-switch-state]");
    if (state) state.textContent = input.checked ? state.dataset.on : state.dataset.off;
  });
})();
