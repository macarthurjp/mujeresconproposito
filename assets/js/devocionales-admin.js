(function setupDevocionalesAdmin() {
  let initialized = false;
  let currentAccess = { is_super_admin: false, permissions: ["read_only"], is_revoked: false };
  let currentUser = null;
  let articles = [];
  let activeFilter = "all";

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

  function message(text, ok = true) {
    const element = $("adminDevocionalMsg");
    if (!element) return;
    element.textContent = text;
    element.className = `form-message ${ok ? "ok" : "err"}`;
    element.style.display = "block";
  }

  function slugify(value) {
    return String(value || "devocional").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "devocional";
  }

  function localDateTime(value) {
    const date = value ? new Date(value) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
  .admin-preview-flag { display:inline-flex; align-items:center; gap:8px; width:max-content; margin:0 0 18px; padding:8px 16px; border-radius:999px; background:#30231c; color:#fff; font-size:.72rem; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
  main { display:block; padding:28px 0 60px; }
</style>
</head>
<body>
<header class="dev-header">
  <span class="dev-brand"><img src="assets/images/logo.webp" alt="" /><span>Mujeres con Propósito</span></span>
</header>
<main>
  <div class="dev-article">
    <span class="admin-preview-flag"><i class="fa-regular fa-eye"></i> Vista previa — sin publicar</span>
    <div class="dev-article-topbar">
      <span class="dev-kicker">${escapeHtml(category)}</span>
      <div class="dev-article-tools">
        <span class="dev-icon-btn"><i class="fa-regular fa-bookmark" aria-hidden="true"></i></span>
        <span class="dev-icon-btn"><i class="fa-solid fa-xmark" aria-hidden="true"></i></span>
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
      ${article.imagenUrl ? `<div class="dev-hero-image"><img src="${escapeHtml(article.imagenUrl)}" alt="" /></div>` : ""}
    </div>
    <div class="dev-article-content">${contentHtml}</div>
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
      <span class="dev-action-btn"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cerrar</span>
    </div>
  </div>
</main>
</body>
</html>`;
  }

  async function openPreview() {
    $("adminDevocionalPreviewOverlay").hidden = false;
    document.body.style.overflow = "hidden";
    const article = await collectPreviewArticle();
    const iframe = $("adminDevocionalPreviewIframe");
    if (iframe) iframe.srcdoc = buildPreviewDocument(article);
  }

  function closePreview() {
    $("adminDevocionalPreviewOverlay").hidden = true;
    document.body.style.overflow = "";
    if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
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
    return {
      x: Math.round(coverCropBox.x * scaleX),
      y: Math.round(coverCropBox.y * scaleY),
      w: Math.round(coverCropBox.w * scaleX),
      h: Math.round(coverCropBox.h * scaleY)
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

  function resetForm() {
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
    document.querySelectorAll('input[name="devCategoria"]').forEach((input) => { input.checked = false; });
    const name = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email?.split("@")[0] || "";
    $("adminDevocionalAutora").value = name;
    $("adminDevocionalMsg").style.display = "none";
  }

  function render() {
    const container = $("adminDevocionalesList");
    if (!container) return;
    const filtered = articles.filter((article) => activeFilter === "all" || (activeFilter === "published" ? article.publicado : !article.publicado));
    if (!filtered.length) {
      container.innerHTML = `<div class="admin-empty">No hay ${activeFilter === "published" ? "artículos publicados" : activeFilter === "draft" ? "borradores" : "artículos"} todavía.</div>`;
      return;
    }
    container.innerHTML = filtered.map((article) => `
      <article class="admin-devotional-item" data-dev-id="${escapeHtml(article.id)}">
        <div class="admin-devotional-thumb">${article.imagen_url ? `<img src="${escapeHtml(article.imagen_url)}" alt="">` : '<i class="fa-solid fa-book-open" aria-hidden="true"></i>'}</div>
        <div class="admin-devotional-item-copy">
          <span class="admin-devotional-state ${article.publicado ? "published" : "draft"}">${article.publicado ? "Publicado" : "Borrador"}</span>
          <strong>${escapeHtml(article.titulo)}</strong>
          <small>${escapeHtml(article.autora)} · ${escapeHtml(formattedDate(article.fecha_publicacion || article.updated_at))}${article.categorias?.length ? ` · ${escapeHtml(article.categorias.join(", "))}` : ""}</small>
        </div>
        <div class="admin-item-actions">
          ${article.publicado ? `<a href="devocionales.html?articulo=${encodeURIComponent(article.slug)}" target="_blank" rel="noopener">Ver</a>` : ""}
          <button type="button" data-dev-action="edit">Editar</button>
          <button type="button" data-dev-action="toggle">${article.publicado ? "Retirar" : "Publicar"}</button>
          <button type="button" data-dev-action="delete" class="danger">Borrar</button>
        </div>
      </article>`).join("");
  }

  async function loadArticles() {
    let query = client().from("devocionales").select("*").order("updated_at", { ascending: false });
    if (currentAccess.permissions.includes("editor") && !currentAccess.is_super_admin) query = query.eq("created_by", currentUser.id);
    const { data, error } = await query;
    if (error) throw error;
    articles = data || [];
    render();
  }

  function edit(article) {
    $("adminDevocionalId").value = article.id;
    $("adminDevocionalTitulo").value = article.titulo || "";
    $("adminDevocionalResumen").value = article.resumen || "";
    $("adminDevocionalContenido").value = article.contenido || "";
    $("adminDevocionalVersiculo").value = article.versiculo || "";
    $("adminDevocionalIntroduccion").innerHTML = cleanRichHtml(article.introduccion_html || article.resumen || "");
    $("adminDevocionalContenidoEditor").innerHTML = cleanRichHtml(article.contenido_html || article.contenido || "");
    document.querySelectorAll('input[name="devCategoria"]').forEach((input) => { input.checked = (article.categorias || []).includes(input.value); });
    $("adminDevocionalAutora").value = article.autora || "";
    $("adminDevocionalFecha").value = localDateTime(article.fecha_publicacion || new Date());
    $("adminDevocionalImagenActual").value = article.imagen_url || "";
    $("adminDevocionalImagen").value = "";
    updateCoverPreview(article.imagen_url || "");
    $("adminDevocionalFormTitle").textContent = "Editar devocional";
    $("adminDevocionalCancel").hidden = false;
    openModal();
  }

  async function save(event) {
    event.preventDefault();
    const submitter = event.submitter;
    const publish = submitter?.dataset.devSave === "publish";
    const id = $("adminDevocionalId").value;
    const title = $("adminDevocionalTitulo").value.trim();
    const reflection = $("adminDevocionalContenidoEditor").innerText.trim();
    if (!reflection) { message("Escribe la reflexión antes de guardar.", false); $("adminDevocionalContenidoEditor").focus(); return; }
    document.querySelectorAll("[data-dev-save]").forEach((button) => { button.disabled = true; });
    try {
      message("Preparando imagen…");
      const uploadFile = await getUploadableCoverFile();
      message(uploadFile ? "Optimizando imagen…" : "Guardando artículo…");
      const imageUrl = uploadFile
        ? await window.McpSupabase.uploadImageToSupabaseBucket(uploadFile, "mcp930-images", "devocionales")
        : $("adminDevocionalImagenActual").value || null;
      const publicationValue = $("adminDevocionalFecha").value;
      const payload = {
        titulo: title,
        resumen: $("adminDevocionalIntroduccion").innerText.trim(),
        contenido: reflection,
        introduccion_html: cleanRichHtml($("adminDevocionalIntroduccion").innerHTML),
        contenido_html: cleanRichHtml($("adminDevocionalContenidoEditor").innerHTML),
        versiculo: $("adminDevocionalVersiculo").value.trim() || null,
        categorias: Array.from(document.querySelectorAll('input[name="devCategoria"]:checked')).map((input) => input.value),
        autora: $("adminDevocionalAutora").value.trim(),
        imagen_url: imageUrl,
        publicado: publish,
        fecha_publicacion: publish ? new Date(publicationValue || Date.now()).toISOString() : null,
        updated_at: new Date().toISOString()
      };
      let error;
      if (id) {
        ({ error } = await client().from("devocionales").update(payload).eq("id", id));
      } else {
        payload.slug = `${slugify(title)}-${Date.now().toString(36)}`;
        payload.created_by = currentUser.id;
        ({ error } = await client().from("devocionales").insert(payload));
      }
      if (error) throw error;
      resetForm();
      closeModal();
      await loadArticles();
      message(publish ? "Devocional publicado correctamente." : "Borrador guardado correctamente.");
    } catch (error) {
      console.error(error);
      message(error?.message || "No se pudo guardar el devocional.", false);
    } finally {
      document.querySelectorAll("[data-dev-save]").forEach((button) => { button.disabled = false; });
    }
  }

  async function listAction(event) {
    const button = event.target.closest("[data-dev-action]");
    if (!button) return;
    const id = button.closest("[data-dev-id]")?.dataset.devId;
    const article = articles.find((item) => String(item.id) === String(id));
    if (!article) return;
    if (button.dataset.devAction === "edit") return edit(article);
    if (button.dataset.devAction === "delete" && !window.confirm(`¿Borrar “${article.titulo}”? Esta acción no se puede deshacer.`)) return;
    button.disabled = true;
    try {
      if (button.dataset.devAction === "delete") {
        const { error } = await client().from("devocionales").delete().eq("id", id);
        if (error) throw error;
      } else {
        const publishing = !article.publicado;
        const { error } = await client().from("devocionales").update({ publicado: publishing, fecha_publicacion: publishing ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      }
      await loadArticles();
    } catch (error) {
      message(error?.message || "No se pudo completar la acción.", false);
      button.disabled = false;
    }
  }

  window.initDevocionalesAdmin = async function initDevocionalesAdmin(access) {
    currentAccess = access && typeof access === "object"
      ? { is_super_admin: Boolean(access.is_super_admin), permissions: Array.isArray(access.permissions) ? access.permissions : ["read_only"], is_revoked: Boolean(access.is_revoked) }
      : { is_super_admin: false, permissions: ["read_only"], is_revoked: false };
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
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !$("adminDevocionalPreviewOverlay").hidden) closePreview();
      });
      $("adminDevocionalesList")?.addEventListener("click", listAction);
      document.querySelectorAll("[data-dev-filter]").forEach((button) => button.addEventListener("click", () => {
        activeFilter = button.dataset.devFilter;
        document.querySelectorAll("[data-dev-filter]").forEach((item) => item.classList.toggle("active", item === button));
        render();
      }));
    }
    const { data, error } = await client().auth.getUser();
    if (error || !data?.user) throw new Error("No se pudo identificar la cuenta editorial.");
    currentUser = data.user;
    resetForm();
    await loadArticles();
  };
})();
