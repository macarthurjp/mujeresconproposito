// Premium design layer: header state on scroll + reveal-on-scroll.
// Purely presentational; no data or form logic lives here.
(function () {
  "use strict";

  var header = document.querySelector("header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !("IntersectionObserver" in window)) return;

  var groups = [
    ".section-header-premium",
    ".ofrecemos-section > h2",
    ".verse-block",
    "#about > p",
    ".timeline-step",
    ".ofrecemos-card",
    ".join-grid",
    ".youtube-explore > *",
    ".donate-container",
    ".gallery-tabs",
    ".soundcloud-mini",
    ".contact-form-card",
    ".calendar-card",
    ".p-app-card"
  ];

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("p-in");
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  groups.forEach(function (selector) {
    var nodes = document.querySelectorAll(selector);
    nodes.forEach(function (node, index) {
      // Only stagger siblings inside the same group, capped so long lists don't lag.
      node.style.setProperty("--p-delay", Math.min(index, 4) * 90 + "ms");
      node.classList.add("p-reveal");
      observer.observe(node);
    });
  });
})();

// Birth date can't be in the future.
(function () {
  var birth = document.getElementById("fecha_nacimiento");
  if (!birth) return;
  var d = new Date();
  var pad = function (n) { return String(n).padStart(2, "0"); };
  birth.max = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  birth.min = "1920-01-01";
})();

// "Copiar enlace" for the calendar subscription.
(function () {
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("[data-copy-calendar]");
    if (!button) return;
    var url = button.getAttribute("data-copy-calendar");
    var original = button.innerHTML;
    var done = function () {
      button.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Enlace copiado';
      setTimeout(function () { button.innerHTML = original; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copia este enlace:", url); });
    } else {
      window.prompt("Copia este enlace:", url);
    }
  });
})();
