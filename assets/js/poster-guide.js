// Destacadas use a 2:3 frame (house format). A 2:3 poster fills it; any other
// ratio is shown whole but looks shorter or narrower. Tell the admin when picking.
(function () {
  var TARGET = 2 / 3, TOLERANCE = 0.03;
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
      var size = " (" + img.naturalWidth + "×" + img.naturalHeight + ")";
      if (Math.abs(ratio - TARGET) <= TOLERANCE) {
        hint.className = "poster-guide is-ok";
        hint.textContent = "Formato correcto 2:3" + size + ": llenará el marco igual que los demás pósteres.";
      } else {
        hint.className = "poster-guide is-warn";
        var shape = ratio > 1.05 ? "horizontal" : ratio >= 0.95 ? "cuadrado" : ratio > TARGET ? "más ancho que 2:3" : "más alargado que 2:3";
        hint.textContent = "Este póster es " + shape + size + ": se verá completo, pero " + (ratio > TARGET ? "más bajo" : "más estrecho") + " que los demás. Para que quede igual, súbelo en 2:3 (1080×1620; en Canva: Cambiar tamaño).";
      }
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); hint.hidden = true; };
    img.src = url;
  }, true);
})();
