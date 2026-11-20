(function setupDevocionalesAdmin() {
  let initialized = false;
  let currentAccess = { is_super_admin: false, permissions: ["read_only"], is_revoked: false };
  let currentUser = null;
  let articles = [];
  let articleTotal = 0;
  let reviewQueue = [];
  let reviewTotal = 0;
  let activeFilter = "all";
  let articlePage = 0;
  let reviewPage = 0;
  const ARTICLE_PAGE_SIZE = 20;
  let editingArticle = null;
  const historyCache = new Map();

  const ESTADO_LABELS = {
    borrador: "Borrador",
    pendiente_revision: "Pendiente de revisión",
    en_revision: "En revisión",
    cambios_solicitados: "Cambios solicitados",
    programado: "Programado",
    publicado: "Publicado",
    eliminado: "Eliminado"
  };

  const ACCION_LABELS = {
    creado: "Creado",
    editado: "Editado",
    enviado_a_revision: "Enviado a revisión",
    cambios_solicitados: "Cambios solicitados",
    retirado: "Retirado de revisión",
    aprobado_publicado: "Aprobado y publicado",
    revision_tomada: "Revisión asignada",
    revision_liberada: "Revisión liberada",
    programado: "Programado",
    despublicado: "Despublicado",
    eliminado: "Eliminado"
  };

  function pendingFields(article) {
    const pending = article?.pending_content || null;
    const get = (key, fallback) => (pending && pending[key] !== undefined && pending[key] !== null ? pending[key] : fallback);
    return {
      autora: article?.autora || "",
      titulo: get("titulo", article?.titulo || ""),
      resumen: get("resumen", article?.resumen || ""),
      contenido: get("contenido", article?.contenido || ""),
      contenido_html: get("contenido_html", article?.contenido_html || ""),
      introduccion_html: get("introduccion_html", article?.introduccion_html || ""),
      versiculo: get("versiculo", article?.versiculo || ""),
      categorias: pending?.categorias || article?.categorias || [],
      imagen_url: get("imagen_url", article?.imagen_url || ""),
      cover_alt: get("cover_alt", article?.cover_alt || ""),
      oracion_html: get("oracion_html", article?.oracion_html || ""),
      fecha: article?.pending_fecha_publicacion || article?.fecha_publicacion || new Date()
    };
  }

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => {
    const node = document.createElement("div");
    node.textContent = String(value || "");
    return node.innerHTML;
  };

  function client() {
    const value = window.McpSupabase?.getSupabaseBrowserClient();
    if (!value) throw new Error("Supabase no está disponible.");
    return value;
  }

  function connectedUserName() {
    return currentAccess.nombre
      || currentUser?.user_metadata?.full_name
      || currentUser?.user_metadata?.name
      || currentUser?.email?.split("@")[0]
      || "";
  }

  function notifyReviewers(devocionalId) {
    client().functions.invoke("send-devotional-review-notification", { body: { id: devocionalId } })
      .catch((error) => console.error("No se pudo notificar a los revisores.", error));
  }

  function canDevotional(action) {
    return currentAccess.is_super_admin || currentAccess.modulePermissions?.includes(`devotionals.${action}`) || false;
  }

  function message(text, ok = true, progress = false) {
    const element = $("adminDevocionalMsg");
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${ok ? "ok" : "err"}${progress ? " is-progress" : ""}`;
    element.style.display = "block";
  }

  function slugify(value) {
    return String(value || "devocional").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "devocional";
  }

  function localDateTime(value) {
    const date = value ? new Date(value) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function cleanRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "BLOCKQUOTE", "H2", "H3", "DIV", "IMG"]);
    template.content.querySelectorAll("*").forEach((node) => {
      if (!allowed.has(node.tagName)) {
        node.replaceWith(...node.childNodes);
        return;
      }
      Array.from(node.attributes).forEach((attribute) => {
        const permitted = attribute.name === "style" || (node.tagName === "IMG" && ["src", "alt"].includes(attribute.name));
        if (!permitted || /url\s*\(|expression|javascript:/i.test(attribute.value)) node.removeAttribute(attribute.name);
      });
      if (node.hasAttribute("style")) {
        const alignment = node.style.textAlign;
        node.removeAttribute("style");
        if (["left", "center", "right", "justify"].includes(alignment)) node.style.textAlign = alignment;
      }
    });
    return template.innerHTML.trim();
  }

  function richToolbarMarkup() {
    return `<select data-rich-command="formatBlock" aria-label="Formato"><option value="p">Párrafo</option><option value="h2">Título</option><option value="h3">Subtítulo</option></select>
      <button type="button" data-rich-command="bold"><b>B</b></button><button type="button" data-rich-command="italic"><i>I</i></button><button type="button" data-rich-command="underline"><u>U</u></button>
      <button type="button" data-rich-command="insertUnorderedList">• Lista</button><button type="button" data-rich-command="justifyLeft">Izquierda</button><button type="button" data-rich-command="justifyCenter">Centrar</button><button type="button" data-rich-command="justifyRight">Derecha</button><button type="button" data-rich-command="justifyFull">Justificar</button>
      <button type="button" data-rich-command="formatBlock" data-rich-value="blockquote">Versículo</button><button type="button" data-rich-image-url>Imagen URL</button><button type="button" data-rich-upload>Subir imagen</button><button type="button" data-rich-clear>Limpiar</button>`;
  }

  function initRichEditors() {
    document.querySelectorAll(".admin-rich-toolbar").forEach((toolbar) => {
      toolbar.innerHTML = richToolbarMarkup();
      const editor = $(toolbar.dataset.editorTarget);
      toolbar.addEventListener("mousedown", (event) => { if (event.target.closest("button")) event.preventDefault(); });
      toolbar.addEventListener("change", (event) => {
        const select = event.target.closest("[data-rich-command]");
        if (!select) return;
        editor.focus();
        document.execCommand(select.dataset.richCommand, false, select.value);
      });
      toolbar.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        editor.focus();
        if (button.dataset.richClear !== undefined) { editor.innerHTML = ""; return; }
        if (button.dataset.richImageUrl !== undefined) {
          const url = window.prompt("Pega la URL segura de la imagen:");
          if (url && /^https:\/\//i.test(url)) document.execCommand("insertImage", false, url);
          return;
        }
        if (button.dataset.richUpload !== undefined) {
          const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp,image/avif";
          input.addEventListener("change", async () => {
            if (!input.files?.[0]) return;
            button.disabled = true;
            try { const url = await window.McpSupabase.uploadImageToSupabaseBucket(input.files[0], "mcp930-images", "devocionales"); editor.focus(); document.execCommand("insertImage", false, url); }
            catch (error) { message(error?.message || "No se pudo subir la imagen.", false); }
            finally { button.disabled = false; }
          });
          input.click(); return;
        }
        const command = button.dataset.richCommand;
        if (command) document.execCommand(command, false, button.dataset.richValue || null);
      });
    });
  }

  function openModal() {
    $("adminDevocionalOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    $("adminDevocionalTitulo")?.focus();
  }

  function closeModal() {
    $("adminDevocionalOverlay").hidden = true;
    document.body.style.overflow = "";
  }

  function formattedDate(value) {
    if (!value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }

  let previewObjectUrl = null;
  let previewReturnFocus = null;

  function previewFormattedDate(value) {
    if (!value) return "Sin fecha";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
  }

  function previewInitials(name) {
    return String(name || "").trim().split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  }

  async function collectPreviewArticle() {
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
    const rect = getCropRectNatural();
    let imagenUrl = $("adminDevocionalImagenActual").value || "";
    if (!isFullCropRect(rect)) {
      const blob = await cropCoverImageToBlob(rect);
      if (blob) { previewObjectUrl = URL.createObjectURL(blob); imagenUrl = previewObjectUrl; }
    } else {
      const file = $("adminDevocionalImagen").files?.[0];
      if (file) { previewObjectUrl = URL.createObjectURL(file); imagenUrl = previewObjectUrl; }
    }
    const autora = $("adminDevocionalAutora").value.trim()
      || currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name
      || currentUser?.email?.split("@")[0] || "Equipo Mujeres con Propósito";
    return {
      titulo: $("adminDevocionalTitulo").value.trim() || "Título del devocional",
      autora,
      fecha: $("adminDevocionalFecha").value,
      categorias: Array.from(document.querySelectorAll('input[name="devCategoria"]:checked')).map((input) => input.value),
      versiculo: $("adminDevocionalVersiculo").value.trim(),
      introduccionHtml: cleanRichHtml($("adminDevocionalIntroduccion").innerHTML),
      contenidoHtml: cleanRichHtml($("adminDevocionalContenidoEditor").innerHTML),
      oracionHtml: $("adminDevocionalOracion")?.innerText.trim() ? cleanRichHtml($("adminDevocionalOracion").innerHTML) : "",
      coverAlt: $("adminDevocionalCoverAlt")?.value.trim() || "",
      imagenUrl
    };
  }

  function previewReadMinutes(html) {
    const text = String(html || "").replace(/<[^>]+>/g, " ");
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  function buildPreviewDocument(article) {
    const categoriesHtml = article.categorias.length
      ? `<div class="dev-categories">${article.categorias.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}</div>`
      : "";
    const metaHtml = `<div class="dev-meta">
      <span class="dev-meta-avatar" aria-hidden="true">${escapeHtml(previewInitials(article.autora))}</span>
      <span class="dev-meta-copy"><strong>${escapeHtml(article.autora)}</strong><span>${escapeHtml(previewFormattedDate(article.fecha))}</span></span>
    </div>`;
    const contenidoHtml = article.contenidoHtml || '<p><em>Aún no has escrito la reflexión…</em></p>';
    const category = article.categorias[0] || "Devocional";
    const readMinutes = previewReadMinutes(article.contenidoHtml);
    const contentHtml = article.introduccionHtml ? `
      <div class="dev-article-section dev-article-intro">
        <span class="dev-section-label">Introducción</span>
        <div class="dev-article-lead">${article.introduccionHtml}</div>
      </div>
      <div class="dev-article-section dev-article-reflection">
        <span class="dev-section-label">Reflexión</span>
        ${contenidoHtml}
      </div>
    ` : contenidoHtml;
    const prayerSection = article.oracionHtml ? `
      <div class="dev-article-section dev-article-prayer" style="margin-top:28px;padding:22px 24px;border-left:4px solid #c9a46b;border-radius:20px;background:linear-gradient(160deg,#fffaf6,#fbf0eb)">
        <span class="dev-section-label">Oración</span>
        <div style="font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:19px;line-height:1.7">${article.oracionHtml}</div>
      </div>` : "";
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700;800&display=swap">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="assets/css/devocionales.css">
<style>
  .admin-preview-flag { display:inline-flex; align-items:center; gap:8px; width:max-content; margin:28px auto 0; padding:8px 16px; border-radius:999px; background:#30231c; color:#fff; font-size:.72rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
  main { display:block; padding:28px 0 60px; }
  button.dev-icon-btn, button.dev-action-btn { font:inherit; cursor:pointer; }
</style>
</head>
<body>
<header class="dev-header">
  <span class="dev-brand"><img src="assets/images/logo.webp?v=2" alt="" /><span>Mujeres con Propósito</span></span>
</header>
<main>
  <span class="admin-preview-flag"><i class="fa-regular fa-eye"></i> Vista previa — sin publicar</span>
  <div class="dev-article">
    <div class="dev-article-topbar">
      <span class="dev-kicker">${escapeHtml(category)}</span>
      <div class="dev-article-tools">
        <span class="dev-icon-btn"><i class="fa-regular fa-bookmark" aria-hidden="true"></i></span>
        <button type="button" class="dev-icon-btn" data-preview-close aria-label="Cerrar vista previa"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="dev-progress">
      <div class="dev-progress-track"><div class="dev-progress-fill" style="width:0%"></div></div>
      <span class="dev-progress-label">1 de ${readMinutes} min de lectura</span>
    </div>
    <h1>${escapeHtml(article.titulo)}</h1>
    ${metaHtml}
    ${categoriesHtml}
    <div class="dev-article-hero-row">
      ${article.versiculo ? `<blockquote class="dev-verse"><i class="fa-solid fa-quote-left" aria-hidden="true"></i>${escapeHtml(article.versiculo)}</blockquote>` : ""}
      ${article.imagenUrl ? `<div class="dev-hero-image"><img src="${escapeHtml(article.imagenUrl)}" alt="${escapeHtml(article.coverAlt || article.titulo || "")}" /></div>` : ""}
    </div>
    <div class="dev-article-content">${contentHtml}${prayerSection}</div>
    <aside class="dev-sidebar">
      <div class="dev-sidebar-card dev-notes-card">
        <span class="dev-sidebar-title"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> Mis notas</span>
        <textarea placeholder="Escribe aquí tus pensamientos…" disabled></textarea>
      </div>
      <div class="dev-sidebar-card dev-soon-card">
        <span class="dev-sidebar-title"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Plan de lectura<span class="dev-soon-badge">Próximamente</span></span>
      </div>
      <div class="dev-sidebar-card dev-soon-card">
        <span class="dev-sidebar-title"><i class="fa-solid fa-hands-praying" aria-hidden="true"></i> ¿Necesitas oración?<span class="dev-soon-badge">Próximamente</span></span>
        <p>Nuestro equipo estará orando por ti.</p>
      </div>
    </aside>
    <div class="dev-author"><span>Publicado por</span><strong>${escapeHtml(article.autora)}</strong><small>${escapeHtml(previewFormattedDate(article.fecha))}</small></div>
    <div class="dev-article-actions">
      <span class="dev-action-btn"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Compartir</span>
      <span class="dev-action-btn dev-action-btn-primary"><i class="fa-regular fa-heart" aria-hidden="true"></i> Guardar en favoritos</span>
      <button type="button" class="dev-action-btn" data-preview-close><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cerrar</button>
    </div>
  </div>
</main>
<script>
  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-preview-close]')) {
      window.parent.postMessage({ type: 'mcp930-devocional-preview-close' }, '*');
    }
  });
</script>
</body>
</html>`;
  }

  // Preview data for a saved article (used by reviewers to read the pending copy).
  function previewFromArticle(article) {
    const f = pendingFields(article);
    return {
      titulo: f.titulo || "Sin título",
      autora: article.autora || "Autora",
      fecha: article.pending_fecha_publicacion || article.fecha_publicacion || article.updated_at,
      categorias: f.categorias || [],
      versiculo: f.versiculo || "",
      introduccionHtml: cleanRichHtml(f.introduccion_html || ""),
      contenidoHtml: cleanRichHtml(f.contenido_html || (f.contenido ? `<p>${escapeHtml(f.contenido)}</p>` : "")),
      oracionHtml: f.oracion_html ? cleanRichHtml(f.oracion_html) : "",
      coverAlt: f.cover_alt || "",
      imagenUrl: f.imagen_url || ""
    };
  }

  /** Modal with a roomy textarea for the reviewer's note. Resolves to the text or null. */
  function askChangesNote(title) {
    return new Promise((resolve) => {
      const previous = document.activeElement;
      const wrap = document.createElement("div");
      wrap.className = "admin-changes-overlay";
      wrap.innerHTML = `
        <div class="admin-changes-dialog" role="dialog" aria-modal="true" aria-labelledby="adminChangesTitle">
          <span class="admin-dashboard-kicker">SOLICITAR CAMBIOS</span>
          <h3 id="adminChangesTitle">${escapeHtml(title)}</h3>
          <p>Explica con detalle qué debe ajustar la autora. Ella recibirá esta nota por correo y en el historial; tú no modificas su texto.</p>
          <label for="adminChangesNote" class="sr-only">Nota para la autora</label>
          <textarea id="adminChangesNote" rows="9" maxlength="10000" placeholder="Ej.: En el segundo párrafo, el versículo citado es Salmo 27:14, no 27:13. Podrías añadir una aplicación práctica al final…"></textarea>
          <div class="admin-changes-meta"><span data-count>0 / 10.000</span></div>
          <div class="admin-changes-actions">
            <button type="button" class="admin-changes-cancel" data-cancel>Cancelar</button>
            <button type="button" class="btn" data-send disabled><i class="fa-solid fa-paper-plane" aria-hidden="true"></i> Enviar a la autora</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const area = wrap.querySelector("textarea");
      const send = wrap.querySelector("[data-send]");
      const count = wrap.querySelector("[data-count]");
      const close = (value) => { wrap.remove(); document.removeEventListener("keydown", onKey, true); previous?.focus?.({ focusVisible: false, preventScroll: true }); resolve(value); };
      const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); close(null); } };
      area.addEventListener("input", () => { count.textContent = `${area.value.length.toLocaleString("es")} / 10.000`; send.disabled = !area.value.trim(); });
      wrap.querySelector("[data-cancel]").addEventListener("click", () => close(null));
      wrap.addEventListener("click", (event) => { if (event.target === wrap) close(null); });
      send.addEventListener("click", () => close(area.value.trim()));
      document.addEventListener("keydown", onKey, true);
      requestAnimationFrame(() => area.focus());
    });
  }

  async function openPreview(article) {
    previewReturnFocus = document.activeElement;
    const overlay = $("adminDevocionalPreviewOverlay");
    const iframe = $("adminDevocionalPreviewIframe");
    if (!overlay || !iframe) return;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    try {
      const data = article && article.id ? previewFromArticle(article) : await collectPreviewArticle();
      iframe.srcdoc = buildPreviewDocument(data);
      $("adminDevocionalPreviewClose")?.focus();
    } catch (error) {
      closePreview();
      message(error?.message || "No se pudo preparar la vista previa.", false);
    }
  }

  function closePreview() {
    const overlay = $("adminDevocionalPreviewOverlay");
    if (overlay) overlay.hidden = true;
    document.body.style.overflow = $("adminDevocionalOverlay") && !$("adminDevocionalOverlay").hidden ? "hidden" : "";
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
    previewReturnFocus?.focus?.();
    previewReturnFocus = null;
  }

  let coverPreviewObjectUrl = null;
  let coverNaturalSize = { w: 0, h: 0 };
  let coverCropBox = null; // { x, y, w, h } in on-screen (stage) pixels

  function updateCoverPreview(url, options = {}) {
    const isLocal = Boolean(options.isLocal);
    if (coverPreviewObjectUrl && coverPreviewObjectUrl !== url) {
      URL.revokeObjectURL(coverPreviewObjectUrl);
      coverPreviewObjectUrl = null;
    }
    if (isLocal) coverPreviewObjectUrl = url;

    const preview = $("adminDevocionalCoverPreview");
    const img = $("adminDevocionalCoverPreviewImg");
    const label = $("adminDevocionalCoverUploadLabel");
    const stage = $("adminDevocionalCropStage");

    if (!url) {
      img.removeAttribute("src");
      preview.hidden = true;
      label.textContent = "Subir foto de portada";
      coverCropBox = null;
      coverNaturalSize = { w: 0, h: 0 };
      return;
    }

    label.textContent = "Cambiar foto de portada";
    preview.hidden = false;
    img.crossOrigin = isLocal ? null : "anonymous";
    img.onload = () => {
      coverNaturalSize = { w: img.naturalWidth, h: img.naturalHeight };
      const stageWidth = stage.clientWidth || 480;
      const stageHeight = Math.max(1, Math.round(stageWidth * (coverNaturalSize.h / (coverNaturalSize.w || 1))));
      stage.style.height = `${stageHeight}px`;
      coverCropBox = { x: 0, y: 0, w: stageWidth, h: stageHeight };
      renderCropUI();
    };
    img.src = url;
  }

  function renderCropUI() {
    const stage = $("adminDevocionalCropStage");
    if (!coverCropBox || !stage) return;
    const stageW = stage.clientWidth;
    const stageH = stage.clientHeight;
    const box = $("adminDevocionalCropBox");
    box.style.left = `${coverCropBox.x}px`;
    box.style.top = `${coverCropBox.y}px`;
    box.style.width = `${coverCropBox.w}px`;
    box.style.height = `${coverCropBox.h}px`;
    $("adminDevocionalCropMaskTop").style.cssText = `left:0;top:0;width:100%;height:${coverCropBox.y}px;`;
    $("adminDevocionalCropMaskBottom").style.cssText = `left:0;top:${coverCropBox.y + coverCropBox.h}px;width:100%;height:${Math.max(0, stageH - coverCropBox.y - coverCropBox.h)}px;`;
    $("adminDevocionalCropMaskLeft").style.cssText = `left:0;top:${coverCropBox.y}px;width:${coverCropBox.x}px;height:${coverCropBox.h}px;`;
    $("adminDevocionalCropMaskRight").style.cssText = `left:${coverCropBox.x + coverCropBox.w}px;top:${coverCropBox.y}px;width:${Math.max(0, stageW - coverCropBox.x - coverCropBox.w)}px;height:${coverCropBox.h}px;`;
  }

  function resetCropToFull() {
    const stage = $("adminDevocionalCropStage");
    if (!stage || !coverNaturalSize.w) return;
    coverCropBox = { x: 0, y: 0, w: stage.clientWidth, h: stage.clientHeight };
    renderCropUI();
  }

  function initCropTool() {
    const stage = $("adminDevocionalCropStage");
    const box = $("adminDevocionalCropBox");
    if (!stage || !box) return;
    const MIN = 32;

    function stagePoint(event) {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    stage.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest(".admin-cover-crop-handle")?.dataset.handle;
      const isBox = event.target === box;
      if (!handle && !isBox) return;
      event.preventDefault();
      const start = stagePoint(event);
      const startBox = { ...coverCropBox };
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;

      function onMove(moveEvent) {
        const p = stagePoint(moveEvent);
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        let { x, y, w, h } = startBox;

        if (isBox) {
          x = Math.min(Math.max(0, startBox.x + dx), stageW - startBox.w);
          y = Math.min(Math.max(0, startBox.y + dy), stageH - startBox.h);
        } else {
          if (handle.includes("n")) {
            const bottom = startBox.y + startBox.h;
            y = Math.min(Math.max(0, startBox.y + dy), bottom - MIN);
            h = bottom - y;
          }
          if (handle.includes("s")) {
            h = Math.min(Math.max(MIN, startBox.h + dy), stageH - startBox.y);
          }
          if (handle.includes("w")) {
            const right = startBox.x + startBox.w;
            x = Math.min(Math.max(0, startBox.x + dx), right - MIN);
            w = right - x;
          }
          if (handle.includes("e")) {
            w = Math.min(Math.max(MIN, startBox.w + dx), stageW - startBox.x);
          }
        }
        coverCropBox = { x, y, w, h };
        renderCropUI();
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  function getCropRectNatural() {
    const stage = $("adminDevocionalCropStage");
    const stageW = stage?.clientWidth;
    const stageH = stage?.clientHeight;
    if (!coverCropBox || !stageW || !stageH || !coverNaturalSize.w) return null;
    const scaleX = coverNaturalSize.w / stageW;
    const scaleY = coverNaturalSize.h / stageH;
    // Round the edges (not width/height independently) and clamp to the
    // image's natural bounds, so x+w and y+h never exceed it — otherwise
    // drawImage() under-fills the canvas and JPEG export bakes in a black
    // line where the transparent leftover pixels get flattened.
    const clamp = (value, max) => Math.max(0, Math.min(max, value));
    const x1 = clamp(Math.round(coverCropBox.x * scaleX), coverNaturalSize.w);
    const y1 = clamp(Math.round(coverCropBox.y * scaleY), coverNaturalSize.h);
    const x2 = clamp(Math.round((coverCropBox.x + coverCropBox.w) * scaleX), coverNaturalSize.w);
    const y2 = clamp(Math.round((coverCropBox.y + coverCropBox.h) * scaleY), coverNaturalSize.h);
    return {
      x: x1,
      y: y1,
      w: Math.max(1, x2 - x1),
      h: Math.max(1, y2 - y1)
    };
  }

  function isFullCropRect(rect) {
    if (!rect) return true;
    const tolerance = 3;
    return rect.x <= tolerance && rect.y <= tolerance
      && Math.abs(rect.w - coverNaturalSize.w) <= tolerance
      && Math.abs(rect.h - coverNaturalSize.h) <= tolerance;
  }

  async function cropCoverImageToBlob(rect) {
    const img = $("adminDevocionalCoverPreviewImg");
    const canvas = document.createElement("canvas");
    canvas.width = rect.w;
    canvas.height = rect.h;
    const ctx = canvas.getContext("2d");
    try {
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    } catch (_) {
      return null;
    }
  }

  async function getUploadableCoverFile() {
    const file = $("adminDevocionalImagen").files?.[0];
    const rect = getCropRectNatural();
    if (isFullCropRect(rect)) return file || null;
    const blob = await cropCoverImageToBlob(rect);
    if (!blob) {
      message("No se pudo aplicar el recorte a esta imagen. Se usará la imagen completa.", false);
      return file || null;
    }
    const baseName = file ? file.name.replace(/\.[^.]+$/, "") : "portada";
    return new File([blob], `${baseName}-recortada.jpg`, { type: "image/jpeg" });
  }

  function updateSaveButtonsVisibility() {
    const draftBtn = document.querySelector('[data-dev-save="draft"]');
    const submitBtn = document.querySelector('[data-dev-save="submit"]');
    const isSuper = Boolean(currentAccess.is_super_admin);
    const isOwn = !editingArticle || editingArticle.created_by === currentUser?.id;
    const canEdit = isSuper || (editingArticle ? canDevotional("edit") : canDevotional("create"));
    if (draftBtn) draftBtn.hidden = !(isOwn || isSuper) || !canEdit;
    // Super Admin may also send their own article to review for a second opinion.
    if (submitBtn) submitBtn.hidden = !isOwn || !canEdit;
    const publishBtn = document.querySelector('[data-dev-save="publish"]');
    if (publishBtn) publishBtn.hidden = !isSuper;
  }

  function resetForm() {
    editingArticle = null;
    $("adminDevocionalForm")?.reset();
    $("adminDevocionalId").value = "";
    $("adminDevocionalImagenActual").value = "";
    updateCoverPreview("");
    $("adminDevocionalFormTitle").textContent = "Nuevo devocional";
    $("adminDevocionalCancel").hidden = true;
    $("adminDevocionalFecha").value = localDateTime();
    $("adminDevocionalVersiculo").value = "";
    $("adminDevocionalIntroduccion").innerHTML = "";
    $("adminDevocionalContenidoEditor").innerHTML = "";
    $("adminDevocionalOracion").innerHTML = "";
    $("adminDevocionalCoverAlt").value = "";
    document.querySelectorAll('input[name="devCategoria"]').forEach((input) => { input.checked = false; });
    $("adminDevocionalAutora").value = connectedUserName();
    $("adminDevocionalMsg").style.display = "none";
    updateSaveButtonsVisibility();
  }

  function statusBadgeHtml(article) {
    if (article.publicado) {
      const pendingFlag = article.pending_content ? `<span class="admin-devotional-pending-flag">Cambios pendientes</span>` : "";
      return `<div class="admin-devotional-badges"><span class="admin-devotional-state published">Publicado</span>${pendingFlag}</div>`;
    }
    const cls = ["pendiente_revision", "en_revision"].includes(article.estado) ? "review" : article.estado === "cambios_solicitados" ? "changes-requested" : article.estado === "programado" ? "scheduled" : "draft";
    const label = ESTADO_LABELS[article.estado] || "Borrador";
    return `<span class="admin-devotional-state ${cls}">${label}</span>`;
  }

  function historyToggleHtml(id) {
    return `<button type="button" class="admin-devotional-history-toggle" data-dev-history="${escapeHtml(id)}">Ver historial</button><div class="admin-devotional-history" data-dev-history-panel="${escapeHtml(id)}" hidden></div>`;
  }

  function publishActionHtml(article) {
    if (!currentAccess.is_super_admin) return "";
    if (article.publicado || article.estado === "programado") return `<button type="button" data-dev-action="return-draft">Retirar de la web</button>`;
    if (["pendiente_revision", "en_revision"].includes(article.estado)) return `<button type="button" data-dev-action="review">Ver en cola editorial</button>`;
    return "";
  }

  function render() {
    const container = $("adminDevocionalesList");
    if (!container) return;
    if (!articles.length) {
      container.innerHTML = `<div class="admin-empty">No hay ${activeFilter === "published" ? "artículos publicados" : activeFilter === "draft" ? "borradores" : "artículos"} todavía.</div>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(articleTotal / ARTICLE_PAGE_SIZE));
    articlePage = Math.min(articlePage, pages - 1);
    container.innerHTML = articles.map((article) => {
      const fields = pendingFields(article);
      const canEdit = article.estado !== "eliminado" && (currentAccess.is_super_admin
        || (article.created_by === currentUser?.id && ["borrador", "cambios_solicitados", "publicado"].includes(article.estado) && canDevotional("edit")));
      const canDelete = canDevotional("delete") && (!article.publicado && !["pendiente_revision", "en_revision", "programado"].includes(article.estado) || currentAccess.is_super_admin);
      return `
      <article class="admin-devotional-item" data-dev-id="${escapeHtml(article.id)}">
        <div class="admin-devotional-thumb">${fields.imagen_url ? `<img src="${escapeHtml(fields.imagen_url)}" alt="">` : '<i class="fa-solid fa-book-open" aria-hidden="true"></i>'}</div>
        <div class="admin-devotional-item-copy">
          ${statusBadgeHtml(article)}
          <strong>${escapeHtml(fields.titulo || "Sin título")}</strong>
          <small>${escapeHtml(article.autora || "Autora asignada")} · ${escapeHtml(formattedDate(article.fecha_publicacion || article.updated_at))}${fields.categorias?.length ? ` · ${escapeHtml(fields.categorias.join(", "))}` : ""}</small>
        </div>
        <div class="admin-item-actions">
          ${article.publicado ? `<a href="devocionales.html?articulo=${encodeURIComponent(article.slug)}" target="_blank" rel="noopener">Ver</a>` : ""}
          ${canEdit ? `<button type="button" data-dev-action="edit">Editar</button>` : ""}
          ${article.created_by === currentUser?.id && ["pendiente_revision", "cambios_solicitados"].includes(article.estado) ? `<button type="button" data-dev-action="withdraw">Retirar de revisión</button>` : ""}
          ${publishActionHtml(article)}
          ${canDelete ? `<button type="button" data-dev-action="delete" class="danger">Borrar</button>` : ""}
        </div>
        ${historyToggleHtml(article.id)}
      </article>`;
    }).join("") + paginationMarkup(articleTotal, articlePage, "articles");
  }

  /** Full pending copy shown inline once the reviewer has claimed the article, with the decision bar under it. */
  function reviewReadingHtml(article, fields, defaultFecha) {
    const verse = String(fields.versiculo || "").trim();
    const body = cleanRichHtml(fields.contenido_html || "") || (fields.contenido ? `<p>${escapeHtml(fields.contenido)}</p>` : "");
    const intro = cleanRichHtml(fields.introduccion_html || "");
    const prayer = fields.oracion_html ? cleanRichHtml(fields.oracion_html) : "";
    return `
        <div class="admin-review-reading" role="region" aria-label="Texto del devocional">
          <div class="admin-review-reading-head"><span class="admin-dashboard-kicker">TU REVISIÓN</span><button type="button" class="admin-review-full" data-dev-review-action="read"><i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i> Ver como en la web</button></div>
          ${fields.imagen_url ? `<img class="admin-review-cover" src="${escapeHtml(fields.imagen_url)}" alt="${escapeHtml(fields.cover_alt || fields.titulo || "")}">` : ""}
          <h4>${escapeHtml(fields.titulo || "Sin título")}</h4>
          ${verse ? `<blockquote class="admin-review-verse">${escapeHtml(verse)}</blockquote>` : ""}
          ${intro ? `<div class="admin-review-intro">${intro}</div>` : ""}
          <div class="admin-review-body">${body || '<p class="admin-review-empty">Sin reflexión.</p>'}</div>
          ${prayer ? `<div class="admin-review-prayer"><span>Oración</span>${prayer}</div>` : ""}
        </div>
        <div class="admin-review-decision">
          <button type="button" data-dev-review-action="release" class="admin-review-ghost">Liberar revisión</button>
          <button type="button" data-dev-review-action="request-changes" class="admin-review-secondary"><i class="fa-regular fa-comment-dots" aria-hidden="true"></i> Solicitar cambios</button>
          <label class="admin-review-date">Publicar el <input type="datetime-local" data-dev-approve-fecha value="${escapeHtml(defaultFecha)}"></label>
          <button type="button" class="btn" data-dev-review-action="approve"><i class="fa-solid fa-check" aria-hidden="true"></i> Aprobar y publicar</button>
        </div>`;
  }

  function renderQueue() {
    const card = $("adminDevocionalReviewCard");
    const container = $("adminDevocionalReviewList");
    if (!card || !container) return;
    const canReview = currentAccess.is_super_admin || (canDevotional("view") && canDevotional("publish"));
    card.hidden = !canReview;
    if (!canReview) return;
    if (!reviewQueue.length) {
      container.innerHTML = `<div class="admin-empty">No hay artículos esperando revisión.</div>`;
      return;
    }
    const pages = Math.max(1, Math.ceil(reviewTotal / ARTICLE_PAGE_SIZE));
    reviewPage = Math.min(reviewPage, pages - 1);
    container.innerHTML = reviewQueue.map((article) => {
      const fields = pendingFields(article);
      // A planned date that already passed means "publish now".
      const planned = article.pending_fecha_publicacion ? new Date(article.pending_fecha_publicacion) : null;
      const defaultFecha = localDateTime(planned && planned > new Date() ? planned : new Date());
      const assigned = article.estado === "en_revision" && article.reviewer_id === currentUser?.id;
      return `
      <article class="admin-devotional-item" data-dev-id="${escapeHtml(article.id)}">
        <div class="admin-devotional-thumb">${fields.imagen_url ? `<img src="${escapeHtml(fields.imagen_url)}" alt="">` : '<i class="fa-solid fa-book-open" aria-hidden="true"></i>'}</div>
        <div class="admin-devotional-item-copy">
          ${statusBadgeHtml(article)}
          <strong>${escapeHtml(fields.titulo || "Sin título")}</strong>
          <small>${escapeHtml(fields.autora)} · enviado ${escapeHtml(formattedDate(article.updated_at))}${fields.categorias?.length ? ` · ${escapeHtml(fields.categorias.join(", "))}` : ""}</small>
        </div>
        <div class="admin-item-actions">
          ${assigned ? "" : `<button type="button" data-dev-review-action="read"><i class="fa-regular fa-eye" aria-hidden="true"></i> Leer devocional</button>`}
          ${article.estado === "pendiente_revision" ? `<button type="button" class="btn" data-dev-review-action="claim">Tomar revisión</button>` : assigned ? "" : `<span>Revisión asignada a otra persona</span>`}
        </div>
        ${assigned ? reviewReadingHtml(article, fields, defaultFecha) : ""}
        ${historyToggleHtml(article.id)}
      </article>`;
    }).join("") + paginationMarkup(reviewTotal, reviewPage, "review");
  }

  function paginationMarkup(total, page, key) {
    if (total <= ARTICLE_PAGE_SIZE) return "";
    const pages = Math.ceil(total / ARTICLE_PAGE_SIZE);
    const start = page * ARTICLE_PAGE_SIZE + 1;
    const end = Math.min((page + 1) * ARTICLE_PAGE_SIZE, total);
    return `<nav class="admin-list-pagination" aria-label="Paginación"><span>Mostrando ${start}–${end} de ${total}</span><div><button type="button" data-dev-page="${key}" data-page="${page - 1}" ${page === 0 ? "disabled" : ""} aria-label="Página anterior">‹</button><span>Página ${page + 1} de ${pages}</span><button type="button" data-dev-page="${key}" data-page="${page + 1}" ${page + 1 >= pages ? "disabled" : ""} aria-label="Página siguiente">›</button></div></nav>`;
  }

  async function loadArticles() {
    const mineCard = $("adminDevocionalMineCard");
    const canSeeMine = currentAccess.is_super_admin || canDevotional("create") || canDevotional("edit");
    if (mineCard) mineCard.hidden = !canSeeMine;
    if (canSeeMine) {
      let query = client().from("devocionales").select("*", { count: "exact" }).neq("estado", "eliminado").order("updated_at", { ascending: false });
      if (!currentAccess.is_super_admin) query = query.eq("created_by", currentUser.id);
      if (activeFilter === "published") query = query.eq("publicado", true);
      if (activeFilter === "draft") query = query.eq("publicado", false);
      const from = articlePage * ARTICLE_PAGE_SIZE;
      const { data, error, count } = await query.range(from, from + ARTICLE_PAGE_SIZE - 1);
      if (error) throw error;
      articles = data || [];
      articleTotal = count || 0;
      if (articleTotal > 0 && articlePage >= Math.ceil(articleTotal / ARTICLE_PAGE_SIZE)) {
        articlePage = Math.ceil(articleTotal / ARTICLE_PAGE_SIZE) - 1;
        return loadArticles();
      }
      render();
    } else {
      articles = [];
      articleTotal = 0;
      render();
    }

    if (currentAccess.is_super_admin || (canDevotional("view") && canDevotional("publish"))) {
      let reviewQuery = client().from("devocionales").select("*", { count: "exact" })
        .in("estado", ["pendiente_revision", "en_revision"]).order("submitted_at", { ascending: true });
      if (!currentAccess.is_super_admin) reviewQuery = reviewQuery.neq("created_by", currentUser.id);
      const from = reviewPage * ARTICLE_PAGE_SIZE;
      const { data, error, count } = await reviewQuery.range(from, from + ARTICLE_PAGE_SIZE - 1);
      if (error) throw error;
      reviewQueue = data || [];
      reviewTotal = count || 0;
      if (reviewTotal > 0 && reviewPage >= Math.ceil(reviewTotal / ARTICLE_PAGE_SIZE)) {
        reviewPage = Math.ceil(reviewTotal / ARTICLE_PAGE_SIZE) - 1;
        return loadArticles();
      }
      renderQueue();
    } else {
      reviewQueue = [];
      reviewTotal = 0;
      renderQueue();
    }
  }

  function edit(article) {
    editingArticle = article;
    const fields = pendingFields(article);
    $("adminDevocionalId").value = article.id;
    $("adminDevocionalTitulo").value = fields.titulo;
    $("adminDevocionalResumen").value = fields.resumen;
    $("adminDevocionalContenido").value = fields.contenido;
    $("adminDevocionalVersiculo").value = fields.versiculo;
    $("adminDevocionalIntroduccion").innerHTML = cleanRichHtml(fields.introduccion_html || fields.resumen || "");
    $("adminDevocionalContenidoEditor").innerHTML = cleanRichHtml(fields.contenido_html || fields.contenido || "");
    document.querySelectorAll('input[name="devCategoria"]').forEach((input) => { input.checked = fields.categorias.includes(input.value); });
    $("adminDevocionalAutora").value = article.autora || "Autora asignada";
    $("adminDevocionalFecha").value = localDateTime(fields.fecha);
    $("adminDevocionalImagenActual").value = fields.imagen_url || "";
    $("adminDevocionalCoverAlt").value = fields.cover_alt || "";
    $("adminDevocionalOracion").innerHTML = cleanRichHtml(fields.oracion_html || "");
    $("adminDevocionalImagen").value = "";
    updateCoverPreview(fields.imagen_url || "");
    $("adminDevocionalFormTitle").textContent = "Editar devocional";
    $("adminDevocionalCancel").hidden = false;
    updateSaveButtonsVisibility();
    openModal();
  }

  async function save(event) {
    event.preventDefault();
    const submitter = event.submitter;
    const action = submitter?.dataset.devSave || "draft";
    const id = $("adminDevocionalId").value;
    const title = $("adminDevocionalTitulo").value.trim();
    const reflection = $("adminDevocionalContenidoEditor").innerText.trim();
    if (!reflection) { message("Escribe la reflexión antes de guardar.", false); $("adminDevocionalContenidoEditor").focus(); return; }
    document.querySelectorAll("[data-dev-save]").forEach((button) => { button.disabled = true; });
    try {
      message("Preparando imagen…", true, true);
      const uploadFile = await getUploadableCoverFile();
      message(uploadFile ? "Optimizando imagen…" : "Guardando artículo…", true, true);
      const imageUrl = uploadFile
        ? await window.McpSupabase.uploadImageToSupabaseBucket(uploadFile, "mcp930-images", "devocionales")
        : $("adminDevocionalImagenActual").value || null;
      const publicationValue = $("adminDevocionalFecha").value;
      const fields = {
        titulo: title,
        resumen: $("adminDevocionalIntroduccion").innerText.trim(),
        contenido: reflection,
        introduccion_html: cleanRichHtml($("adminDevocionalIntroduccion").innerHTML),
        contenido_html: cleanRichHtml($("adminDevocionalContenidoEditor").innerHTML),
        versiculo: $("adminDevocionalVersiculo").value.trim() || null,
        categorias: Array.from(document.querySelectorAll('input[name="devCategoria"]:checked')).map((input) => input.value),
        imagen_url: imageUrl,
        cover_alt: $("adminDevocionalCoverAlt").value.trim() || null,
        oracion_html: $("adminDevocionalOracion").innerText.trim() ? cleanRichHtml($("adminDevocionalOracion").innerHTML) : null
      };

      let error;
      let savedId = id ? Number(id) : null;

        const payload = {
          pending_content: fields,
          pending_fecha_publicacion: publicationValue ? new Date(publicationValue).toISOString() : null,
          updated_at: new Date().toISOString()
        };
        if (id) {
          ({ error } = await client().from("devocionales").update(payload).eq("id", id));
        } else {
          payload.slug = `${slugify(title)}-${Date.now().toString(36)}`;
          payload.created_by = currentUser.id;
          payload.autora = connectedUserName() || "Equipo Mujeres con Propósito";
          const { data, error: insertError } = await client().from("devocionales").insert(payload).select("id").single();
          error = insertError;
          savedId = data?.id || null;
        }
        if (!error && action === "submit" && savedId) {
          const { error: submitError } = await client().rpc("devocional_submit_for_review", { p_id: savedId });
          if (submitError) error = submitError;
          else notifyReviewers(savedId);
        }
        // Super Admin: publish (or schedule) directly, without review.
        if (!error && action === "publish" && savedId && currentAccess.is_super_admin) {
          const fecha = publicationValue ? new Date(publicationValue).toISOString() : null;
          const { error: publishError } = await client().rpc("devocional_approve_and_publish", { p_id: savedId, p_fecha: fecha });
          if (publishError) error = publishError;
        }
      if (error) throw error;
      resetForm();
      closeModal();
      await loadArticles();
      const scheduled = action === "publish" && publicationValue && new Date(publicationValue) > new Date();
      message(action === "submit" ? "Devocional enviado a revisión."
        : action === "publish" ? (scheduled ? "Devocional programado." : "Devocional publicado.")
        : "Borrador guardado correctamente.");
    } catch (error) {
      console.error(error);
      message(error?.message || "No se pudo guardar el devocional.", false);
    } finally {
      document.querySelectorAll("[data-dev-save]").forEach((button) => { button.disabled = false; });
    }
  }

  async function toggleHistory(button) {
    const id = button.dataset.devHistory;
    const panel = document.querySelector(`[data-dev-history-panel="${id}"]`);
    if (!panel) return;
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    if (historyCache.has(id)) { panel.innerHTML = historyCache.get(id); return; }
    panel.innerHTML = `<div class="admin-empty">Cargando historial…</div>`;
    try {
      const { data, error } = await client().from("devocional_historial").select("*").eq("devocional_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      const html = data?.length
        ? `<ul>${data.map((entry) => `<li><strong>${escapeHtml(ACCION_LABELS[entry.accion] || entry.accion)}</strong> — ${escapeHtml(entry.actor_email || "cuenta eliminada")} · ${escapeHtml(formattedDate(entry.created_at))}${entry.nota ? `<em>${escapeHtml(entry.nota)}</em>` : ""}</li>`).join("")}</ul>`
        : `<div class="admin-empty">Sin historial todavía.</div>`;
      historyCache.set(id, html);
      panel.innerHTML = html;
    } catch (error) {
      panel.innerHTML = `<div class="admin-empty">No se pudo cargar el historial.</div>`;
    }
  }

  async function listAction(event) {
    const pageButton = event.target.closest("[data-dev-page='articles']");
    if (pageButton) { articlePage = Number(pageButton.dataset.page) || 0; loadArticles().catch((error) => message(error?.message || "No se pudo cambiar de página.", false)); return; }
    const historyButton = event.target.closest("[data-dev-history]");
    if (historyButton) return toggleHistory(historyButton);

    const button = event.target.closest("[data-dev-action]");
    if (!button) return;
    const id = button.closest("[data-dev-id]")?.dataset.devId;
    const article = articles.find((item) => String(item.id) === String(id));
    if (!article) return;
    if (button.dataset.devAction === "edit") return edit(article);
    if (button.dataset.devAction === "review") {
      try {
        if (!currentAccess.is_super_admin && !(canDevotional("view") && canDevotional("publish"))) {
          message("Tu cuenta no tiene acceso a la cola editorial.", false);
          return;
        }
        button.disabled = true;
        await loadArticles();
        let targetPage = -1;
        const totalPages = Math.max(1, Math.ceil(reviewTotal / ARTICLE_PAGE_SIZE));
        for (let page = 0; page < totalPages; page += 1) {
          const from = page * ARTICLE_PAGE_SIZE;
          const { data, error } = await client().from("devocionales").select("id")
            .in("estado", ["pendiente_revision", "en_revision"]).order("submitted_at", { ascending: true })
            .range(from, from + ARTICLE_PAGE_SIZE - 1);
          if (error) throw error;
          if ((data || []).some((item) => String(item.id) === String(id))) { targetPage = page; break; }
        }
        if (targetPage >= 0 && targetPage !== reviewPage) {
          reviewPage = targetPage;
          await loadArticles();
        }
        const queueCard = $("adminDevocionalReviewCard");
        const queueItem = Array.from($("adminDevocionalReviewList")?.querySelectorAll("[data-dev-id]") || [])
          .find((item) => item.dataset.devId === String(id));
        if (!queueCard || queueCard.hidden || !queueItem) {
          message("No se encontró este artículo en la cola. Actualiza la lista o verifica sus permisos.", false);
          button.disabled = false;
          return;
        }
        queueItem.scrollIntoView({ behavior: "smooth", block: "center" });
        queueItem.classList.add("admin-devotional-item-highlight");
        setTimeout(() => queueItem.classList.remove("admin-devotional-item-highlight"), 2200);
        message("Artículo localizado en la cola editorial.");
      } catch (error) {
        message(error?.message || "No se pudo abrir la cola editorial.", false);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (button.dataset.devAction === "delete" && !window.confirm(`¿Mover “${article.titulo || "este devocional"}” a eliminados? Se conserva el historial editorial.`)) return;
    if (button.dataset.devAction === "return-draft" && !window.confirm(`¿Devolver “${article.titulo || "este devocional"}” a borrador?`)) return;
    button.disabled = true;
    try {
      if (button.dataset.devAction === "delete") {
        const { error } = await client().rpc("devocional_soft_delete", { p_id: Number(id) });
        if (error) throw error;
      } else if (button.dataset.devAction === "withdraw") {
        const { error } = await client().rpc("devocional_withdraw", { p_id: Number(id) });
        if (error) throw error;
      } else if (button.dataset.devAction === "return-draft") {
        if (!window.confirm("¿Retirar este devocional de la web? Quedará como borrador y podrás volver a publicarlo.")) { button.disabled = false; return; }
        const { error } = await client().rpc("devocional_unpublish", { p_id: Number(id) });
        if (error) throw error;
      }
      await loadArticles();
    } catch (error) {
      message(error?.message || "No se pudo completar la acción.", false);
      button.disabled = false;
    }
  }

  async function reviewQueueAction(event) {
    const pageButton = event.target.closest("[data-dev-page='review']");
    if (pageButton) { reviewPage = Number(pageButton.dataset.page) || 0; loadArticles().catch((error) => message(error?.message || "No se pudo cambiar de página.", false)); return; }
    const historyButton = event.target.closest("[data-dev-history]");
    if (historyButton) return toggleHistory(historyButton);

    const button = event.target.closest("[data-dev-review-action]");
    if (!button) return;
    const card = button.closest("[data-dev-id]");
    const id = card?.dataset.devId;
    const article = reviewQueue.find((item) => String(item.id) === String(id));
    if (!article) return;
    const action = button.dataset.devReviewAction;

    if (action === "read") {
      if (article) openPreview(article);
      return;
    }

    if (action === "claim") {
      button.disabled = true;
      try {
        const { error } = await client().rpc("devocional_claim_review", { p_id: Number(id) });
        if (error) throw error;
        await loadArticles();
        message("Revisión asignada a tu cuenta.");
      } catch (error) {
        message(error?.message || "No se pudo tomar la revisión.", false);
        button.disabled = false;
      }
      return;
    }

    if (action === "release") {
      button.disabled = true;
      try {
        const { error } = await client().rpc("devocional_release_review", { p_id: Number(id) });
        if (error) throw error;
        await loadArticles();
        message("La revisión volvió a la cola.");
      } catch (error) {
        message(error?.message || "No se pudo liberar la revisión.", false);
        button.disabled = false;
      }
      return;
    }

    if (action === "request-changes") {
      const nota = await askChangesNote(pendingFields(article || {}).titulo || "este devocional");
      if (nota === null) return;
      if (!nota.trim()) { message("Escribe una nota explicando los cambios solicitados.", false); return; }
      button.disabled = true;
      try {
        const { error } = await client().rpc("devocional_request_changes", { p_id: Number(id), p_nota: nota.trim() });
        if (error) throw error;
        await loadArticles();
        message("Se solicitaron cambios al editor.");
      } catch (error) {
        message(error?.message || "No se pudo enviar la solicitud de cambios.", false);
        button.disabled = false;
      }
      return;
    }

    if (action === "approve") {
      const fechaInput = card.querySelector("[data-dev-approve-fecha]");
      const fecha = fechaInput?.value ? new Date(fechaInput.value).toISOString() : null;
      button.disabled = true;
      try {
        const { error } = await client().rpc("devocional_approve_and_publish", { p_id: Number(id), p_fecha: fecha });
        if (error) throw error;
        await loadArticles();
        message("Devocional aprobado y publicado.");
      } catch (error) {
        message(error?.message || "No se pudo aprobar el devocional.", false);
        button.disabled = false;
      }
    }
  }

  window.initDevocionalesAdmin = async function initDevocionalesAdmin(access) {
    currentAccess = access && typeof access === "object"
      ? { is_super_admin: Boolean(access.is_super_admin), permissions: Array.isArray(access.permissions) ? access.permissions : ["read_only"], modulePermissions: Array.isArray(access.modulePermissions) ? access.modulePermissions : [], is_revoked: Boolean(access.is_revoked), nombre: String(access.nombre || "").trim() }
      : { is_super_admin: false, permissions: ["read_only"], modulePermissions: [], is_revoked: false, nombre: "" };
    if (!initialized) {
      initialized = true;
      initRichEditors();
      initCropTool();
      $("adminDevocionalForm")?.addEventListener("submit", save);
      $("adminDevocionalOpen")?.addEventListener("click", () => { resetForm(); openModal(); });
      $("adminDevocionalClose")?.addEventListener("click", closeModal);
      $("adminDevocionalCancel")?.addEventListener("click", () => { resetForm(); closeModal(); });
      $("adminDevocionalOverlay")?.addEventListener("click", (event) => { if (event.target === $("adminDevocionalOverlay")) closeModal(); });
      $("adminDevocionalImagen")?.addEventListener("change", () => {
        const file = $("adminDevocionalImagen").files?.[0];
        if (!file) return;
        updateCoverPreview(URL.createObjectURL(file), { isLocal: true });
      });
      $("adminDevocionalCoverRemove")?.addEventListener("click", () => {
        $("adminDevocionalImagen").value = "";
        $("adminDevocionalImagenActual").value = "";
        updateCoverPreview("");
      });
      $("adminDevocionalCropReset")?.addEventListener("click", resetCropToFull);
      $("adminDevocionalPreview")?.addEventListener("click", openPreview);
      $("adminDevocionalPreviewClose")?.addEventListener("click", closePreview);
      $("adminDevocionalPreviewOverlay")?.addEventListener("click", (event) => { if (event.target === $("adminDevocionalPreviewOverlay")) closePreview(); });
      window.addEventListener("message", (event) => {
        if (event.source === $("adminDevocionalPreviewIframe")?.contentWindow && event.data?.type === "mcp930-devocional-preview-close") closePreview();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !$("adminDevocionalPreviewOverlay").hidden) closePreview();
      });
      $("adminDevocionalesList")?.addEventListener("click", listAction);
      $("adminDevocionalReviewList")?.addEventListener("click", reviewQueueAction);
      document.querySelectorAll("[data-dev-filter]").forEach((button) => button.addEventListener("click", () => {
        activeFilter = button.dataset.devFilter;
        articlePage = 0;
        document.querySelectorAll("[data-dev-filter]").forEach((item) => item.classList.toggle("active", item === button));
        loadArticles().catch((error) => message(error?.message || "No se pudo cargar la lista.", false));
      }));
    }
    const { data, error } = await client().auth.getUser();
    if (error || !data?.user) throw new Error("No se pudo identificar la cuenta editorial.");
    currentUser = data.user;
    resetForm();
    await loadArticles();
  };
})();
