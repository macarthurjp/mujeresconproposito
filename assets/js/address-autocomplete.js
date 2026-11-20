// Address suggestions while typing, for inputs marked data-address-autocomplete.
// Uses Photon (OpenStreetMap): free, no key, built for autocomplete. Anything
// typed by hand (e.g. "En línea") is kept; picking a suggestion fills the field.
(function () {
  var ONLINE = /^https?:\/\/|\b(zoom|en l[ií]nea|online|google meet|meet|teams|virtual|youtube)\b/i;
  var timer = null;
  var controller = null;

  function format(p) {
    var street = p.street ? p.street + (p.housenumber ? " " + p.housenumber : "") : "";
    var first = p.name && p.name !== p.street ? p.name : street;
    var place = [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(" ");
    return [first, first === street ? "" : street, place, p.country].filter(Boolean).join(", ");
  }

  function listFor(input) {
    var list = input.parentElement.querySelector(".address-suggestions");
    if (!list) {
      list = document.createElement("ul");
      list.className = "address-suggestions";
      list.setAttribute("role", "listbox");
      list.hidden = true;
      input.insertAdjacentElement("afterend", list);
      input.setAttribute("autocomplete", "off");
      input.setAttribute("aria-autocomplete", "list");
    }
    return list;
  }

  function render(input, labels) {
    var list = listFor(input);
    list.innerHTML = "";
    labels.forEach(function (label) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.textContent = label;
      li.addEventListener("mousedown", function (event) {
        event.preventDefault();
        input.value = label;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dataset.addressPicked = label;
        list.hidden = true;
      });
      list.appendChild(li);
    });
    if (labels.length) {
      var credit = document.createElement("li");
      credit.className = "address-credit";
      credit.setAttribute("aria-hidden", "true");
      credit.textContent = "Sugerencias de OpenStreetMap";
      list.appendChild(credit);
    }
    list.hidden = !labels.length;
  }

  document.addEventListener("input", function (event) {
    var input = event.target.closest && event.target.closest("input[data-address-autocomplete]");
    if (!input) return;
    var q = input.value.trim();
    if (input.dataset.addressPicked === q) return;
    clearTimeout(timer);
    if (controller) controller.abort();
    if (q.length < 3 || ONLINE.test(q)) { render(input, []); return; }
    timer = setTimeout(function () {
      controller = new AbortController();
      fetch("https://photon.komoot.io/api/?q=" + encodeURIComponent(q) + "&limit=5", { signal: controller.signal })
        .then(function (r) { return r.ok ? r.json() : { features: [] }; })
        .then(function (data) {
          var seen = {};
          var labels = (data.features || []).map(function (f) { return format(f.properties || {}); })
            .filter(function (l) { if (!l || seen[l]) return false; seen[l] = true; return true; });
          render(input, labels);
        })
        .catch(function () { /* aborted or offline: keep what was typed */ });
    }, 350);
  });

  document.addEventListener("focusout", function (event) {
    var input = event.target.closest && event.target.closest("input[data-address-autocomplete]");
    if (input) setTimeout(function () { var l = input.parentElement.querySelector(".address-suggestions"); if (l) l.hidden = true; }, 150);
  });
})();
