// Destacadas: posters are shown whole in a 4:5 frame, so every vertical flyer
// up to 4:5 (2:3, 3:4, 4:5) gets the same height automatically. Only wider
// images (square or landscape) look shorter; warn when one is picked.
(function () {
  var MAX_RATIO = 0.82; // 4:5 = 0.8, small tolerance
  function isPosterInput(input) {
    if (!input || input.type !== "file") return false;
    if (input.id === "adminDestacadaFoto") return true;
    var form = input.form;
    return input.name === "foto_file" && !!form && !!form.querySelector('[name="titulo"]') && !form.querySelector('[name="categoria"]');
  }
  function hintFor(input) {
    var host = input.closest("label") || input.parentElement;
    var hint = host.querySelector(".poster-guide");
    if (!hint) {
      hint = document.createElement("p");
      hint.className = "poster-guide";
      hint.setAttribute("role", "status");
      host.appendChild(hint);
    }
    return hint;
  }
  document.addEventListener("change", function (event) {
    var input = event.target;
    if (!isPosterInput(input)) return;
    var file = input.files && input.files[0];
    var hint = hintFor(input);
    if (!file) { hint.hidden = true; return; }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var ratio = img.naturalWidth / img.naturalHeight;
      hint.hidden = false;
      if (ratio > MAX_RATIO) {
        hint.className = "poster-guide is-warn";
        hint.textContent = "Este póster es " + (ratio >= 0.98 ? (ratio > 1.05 ? "horizontal" : "cuadrado") : "más ancho de lo recomendado") + " (" + img.naturalWidth + "×" + img.naturalHeight + "): se verá completo pero más bajo que los demás. Ideal: vertical 4:5 (1080×1350) o 2:3 (1080×1620).";
      } else {
        hint.className = "poster-guide is-ok";
        hint.textContent = "Formato correcto (" + img.naturalWidth + "×" + img.naturalHeight + "): se verá a la misma altura que los demás pósteres.";
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); hint.hidden = true; };
    img.src = url;
  }, true);
})();
