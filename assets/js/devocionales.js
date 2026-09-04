(function initDevocionales() {
  const SITE_URL = "https://mcp930.org";
  const grid = document.getElementById("devGrid");
  const featured = document.getElementById("devFeatured");
  const collectionHead = document.getElementById("devCollectionHead");
  const status = document.getElementById("devStatus");
  const search = document.getElementById("devSearch");
  const year = document.getElementById("devYear");
  let articles = [];

  if (year) year.textContent = new Date().getFullYear();

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value || "");
    return element.innerHTML;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(value));
  }

  function publisherName(article) {
    return String(article.autora || "Equipo Mujeres con Propósito").trim();
  }

  function publisherInitials(article) {
    return publisherName(article).split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();
  }

  function articleMeta(article, compact = false) {
    return `<div class="dev-meta${compact ? " dev-meta-compact" : ""}">
      <span class="dev-meta-avatar" aria-hidden="true">${escapeHtml(publisherInitials(article))}</span>
      <span class="dev-meta-copy"><strong>${escapeHtml(publisherName(article))}</strong><span>${escapeHtml(formatDate(article.fecha_publicacion))}</span></span>
    </div>`;
  }

  function contentHtml(value) {
    return String(value || "").split(/\n\s*\n/).filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
  }

  function safeRichHtml(html, fallback) {
    if (!html) return contentHtml(fallback);
    const template = document.createElement("template");
    template.innerHTML = String(html);
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "BLOCKQUOTE", "H2", "H3", "DIV", "IMG"]);
    template.content.querySelectorAll("*").forEach((node) => {
      if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
      Array.from(node.attributes).forEach((attribute) => {
        const allowedAttribute = attribute.name === "style" || (node.tagName === "IMG" && ["src", "alt"].includes(attribute.name));
        if (!allowedAttribute || /javascript:|expression|url\s*\(/i.test(attribute.value)) node.removeAttribute(attribute.name);
      });
      if (node.tagName === "IMG" && !/^https:\/\//i.test(node.getAttribute("src") || "")) node.remove();
      if (node.hasAttribute("style")) {
        const alignment = node.style.textAlign;
        node.removeAttribute("style");
        if (["left", "center", "right", "justify"].includes(alignment)) node.style.textAlign = alignment;
      }
    });
    return template.innerHTML;
  }

  function categoryTags(article) {
    return Array.isArray(article.categorias) && article.categorias.length
      ? `<div class="dev-categories">${article.categorias.map((category) => `<span>${escapeHtml(category)}</span>`).join("")}</div>` : "";
  }

  function articleCard(article) {
    const image = article.imagen_url
      ? `<img src="${escapeHtml(article.imagen_url)}" alt="" loading="lazy" />`
      : `<div class="dev-card-placeholder"><i class="fa-solid fa-book-open" aria-hidden="true"></i></div>`;
    return `<article class="dev-card">
      <a href="?articulo=${encodeURIComponent(article.slug)}" class="dev-card-link" aria-label="Leer ${escapeHtml(article.titulo)}">
        <div class="dev-card-media">${image}</div>
        <div class="dev-card-body">
          ${articleMeta(article, true)}
          ${categoryTags(article)}
          <h3>${escapeHtml(article.titulo)}</h3>
          <p>${escapeHtml(article.resumen || "Una nueva reflexión para acompañar tu caminar con Dios.")}</p>
          <span class="dev-read">Leer devocional <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
        </div>
      </a>
    </article>`;
  }

  function featuredArticle(article) {
    const image = article.imagen_url
      ? `<img src="${escapeHtml(article.imagen_url)}" alt="" />`
      : `<div class="dev-featured-art" aria-hidden="true"><i class="fa-solid fa-book-bible"></i><span>“Tu palabra es una lámpara a mis pies.”</span></div>`;
    return `<article>
      <a href="?articulo=${encodeURIComponent(article.slug)}" class="dev-featured-link" aria-label="Leer ${escapeHtml(article.titulo)}">
        <div class="dev-featured-media">${image}</div>
        <div class="dev-featured-copy">
          <span class="dev-featured-label"><i class="fa-regular fa-star" aria-hidden="true"></i> Lectura destacada</span>
          ${articleMeta(article)}
          ${categoryTags(article)}
          <h3>${escapeHtml(article.titulo)}</h3>
          <p>${escapeHtml(article.resumen || "Una nueva reflexión para acompañar tu caminar con Dios.")}</p>
          <span class="dev-featured-button">Comenzar a leer <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
        </div>
      </a>
    </article>`;
  }

  function renderList(items) {
    const visible = items || articles;
    const isFiltering = Boolean(search?.value.trim());
    featured.innerHTML = !isFiltering && visible[0] ? featuredArticle(visible[0]) : "";
    const cards = !isFiltering ? visible.slice(1) : visible;
    grid.innerHTML = cards.map(articleCard).join("");
    collectionHead.hidden = cards.length === 0;
    status.hidden = visible.length > 0;
    if (!visible.length) status.innerHTML = `<div class="dev-empty-icon"><i class="fa-solid fa-feather-pointed" aria-hidden="true"></i></div><strong>${isFiltering ? "No encontramos coincidencias" : "Estamos preparando algo especial"}</strong><span>${isFiltering ? "Prueba con otra palabra o autora." : "Muy pronto encontrarás aquí reflexiones escritas con fe y propósito."}</span>`;
  }

  const FAV_KEY = "mcp-devocionales-favoritos";

  function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (_) { return []; }
  }
  function isFavorite(slug) { return getFavorites().includes(slug); }
  function toggleFavorite(slug) {
    const favs = getFavorites();
    const idx = favs.indexOf(slug);
    if (idx === -1) favs.push(slug); else favs.splice(idx, 1);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch (_) {}
    return favs.includes(slug);
  }

  function notesKey(slug) { return `mcp-devocional-notas-${slug}`; }
  function loadNotes(slug) { try { return localStorage.getItem(notesKey(slug)) || ""; } catch (_) { return ""; } }
  function saveNotes(slug, value) { try { localStorage.setItem(notesKey(slug), value); } catch (_) {} }

  function estimateReadMinutes(html) {
    const text = String(html || "").replace(/<[^>]+>/g, " ");
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  }

  function updateFavoriteButtons(pressed) {
    document.querySelectorAll("[data-fav-toggle]").forEach((button) => {
      button.setAttribute("aria-pressed", String(pressed));
      const icon = button.querySelector("i");
      if (icon) icon.className = icon.className.includes("fa-heart")
        ? `fa-${pressed ? "solid" : "regular"} fa-heart`
        : `fa-${pressed ? "solid" : "regular"} fa-bookmark`;
      const label = button.querySelector("[data-fav-label]");
      if (label) label.textContent = pressed ? "Guardado en favoritos" : "Guardar en favoritos";
    });
  }

  function initReadingProgress(readMinutes) {
    const content = document.getElementById("devArticleContent");
    const fill = document.getElementById("devProgressFill");
    const currentLabel = document.getElementById("devProgressCurrent");
    if (!content || !fill) return;
    function update() {
      const rect = content.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const total = Math.max(1, rect.height - viewportH * 0.5);
      const scrolled = Math.min(Math.max(0, viewportH * 0.3 - rect.top), total);
      const pct = Math.min(1, scrolled / total);
      fill.style.width = `${Math.round(pct * 100)}%`;
      if (currentLabel) currentLabel.textContent = Math.max(1, Math.round(pct * readMinutes));
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  function updateShareCountDisplay(count) {
    const el = document.getElementById("devShareCount");
    if (!el) return;
    if (count > 0) {
      el.textContent = `${count} compartido${count === 1 ? "" : "s"}`;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  async function incrementShareCount(slug) {
    try {
      const client = window.McpSupabase?.getSupabaseBrowserClient();
      if (!client) return;
      const { data, error } = await client.rpc("increment_devocional_share", { p_slug: slug });
      if (!error && typeof data === "number") updateShareCountDisplay(data);
    } catch (_) { /* el contador es un extra, no debe romper el compartir */ }
  }

  async function shareArticle(article) {
    const url = `${SITE_URL}/d/${encodeURIComponent(article.slug)}.html`;
    try {
      if (navigator.share) {
        await navigator.share({ title: article.titulo, text: article.resumen || "", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        window.alert("Enlace copiado al portapapeles.");
      }
      incrementShareCount(article.slug);
    } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
  }

  function initArticleInteractions(article) {
    const notesInput = document.getElementById("devNotesInput");
    if (notesInput) {
      notesInput.value = loadNotes(article.slug);
      let notesTimer = null;
      notesInput.addEventListener("input", () => {
        clearTimeout(notesTimer);
        notesTimer = setTimeout(() => saveNotes(article.slug, notesInput.value), 400);
      });
    }
    document.querySelectorAll("[data-fav-toggle]").forEach((button) => {
      button.addEventListener("click", () => updateFavoriteButtons(toggleFavorite(article.slug)));
    });
    document.querySelectorAll("[data-share]").forEach((button) => {
      button.addEventListener("click", () => shareArticle(article));
    });
    updateShareCountDisplay(article.compartidos || 0);
    initReadingProgress(estimateReadMinutes(article.contenido_html || article.contenido));
  }

  function renderArticle(article) {
    document.title = `${article.titulo} — Mujeres con Propósito`;
    document.querySelector(".dev-hero").hidden = true;
    const category = (article.categorias || [])[0] || "Devocional";
    const readMinutes = estimateReadMinutes(article.contenido_html || article.contenido);
    const favored = isFavorite(article.slug);
    document.querySelector(".dev-library").innerHTML = `<article class="dev-article">
      <div class="dev-article-topbar">
        <span class="dev-kicker">${escapeHtml(category)}</span>
        <div class="dev-article-tools">
          <button type="button" class="dev-icon-btn" data-fav-toggle aria-pressed="${favored}" aria-label="Guardar en favoritos"><i class="fa-${favored ? "solid" : "regular"} fa-bookmark" aria-hidden="true"></i></button>
          <a href="devocionales.html" class="dev-icon-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></a>
        </div>
      </div>
      <div class="dev-progress">
        <div class="dev-progress-track"><div class="dev-progress-fill" id="devProgressFill"></div></div>
        <span class="dev-progress-label"><span id="devProgressCurrent">1</span> de ${readMinutes} min de lectura</span>
      </div>
      <h1>${escapeHtml(article.titulo)}</h1>
      ${articleMeta(article)}
      <div class="dev-article-hero-row">
        ${article.versiculo ? `<blockquote class="dev-verse"><i class="fa-solid fa-quote-left" aria-hidden="true"></i>${escapeHtml(article.versiculo)}</blockquote>` : ""}
        ${article.imagen_url ? `<div class="dev-hero-image"><img src="${escapeHtml(article.imagen_url)}" alt="" /></div>` : ""}
      </div>
      <div class="dev-article-content" id="devArticleContent">
        ${(article.introduccion_html || article.resumen) ? `
          <div class="dev-article-section dev-article-intro">
            <span class="dev-section-label">Introducción</span>
            <div class="dev-article-lead">${safeRichHtml(article.introduccion_html, article.resumen)}</div>
          </div>
          <div class="dev-article-section dev-article-reflection">
            <span class="dev-section-label">Reflexión</span>
            ${safeRichHtml(article.contenido_html, article.contenido)}
          </div>
        ` : safeRichHtml(article.contenido_html, article.contenido)}
      </div>
      <aside class="dev-sidebar">
        <div class="dev-sidebar-card dev-notes-card">
          <span class="dev-sidebar-title"><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> Mis notas</span>
          <textarea id="devNotesInput" placeholder="Escribe aquí tus pensamientos…"></textarea>
        </div>
        <div class="dev-sidebar-card dev-soon-card">
          <span class="dev-sidebar-title"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Plan de lectura<span class="dev-soon-badge">Próximamente</span></span>
        </div>
        <div class="dev-sidebar-card dev-soon-card">
          <span class="dev-sidebar-title"><i class="fa-solid fa-hands-praying" aria-hidden="true"></i> ¿Necesitas oración?<span class="dev-soon-badge">Próximamente</span></span>
          <p>Nuestro equipo estará orando por ti.</p>
        </div>
      </aside>
      <div class="dev-author"><span>Publicado por</span><strong>${escapeHtml(publisherName(article))}</strong><small>${escapeHtml(formatDate(article.fecha_publicacion))}</small></div>
      <div class="dev-article-actions">
        <button type="button" class="dev-action-btn" data-share><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Compartir</button>
        <button type="button" class="dev-action-btn dev-action-btn-primary" data-fav-toggle aria-pressed="${favored}"><i class="fa-${favored ? "solid" : "regular"} fa-heart" aria-hidden="true"></i> <span data-fav-label>${favored ? "Guardado en favoritos" : "Guardar en favoritos"}</span></button>
        <a href="devocionales.html" class="dev-action-btn"><i class="fa-solid fa-xmark" aria-hidden="true"></i> Cerrar</a>
      </div>
      <p class="dev-share-count" id="devShareCount" hidden></p>
    </article>`;
    initArticleInteractions(article);
  }

  async function load() {
    try {
      const client = window.McpSupabase?.getSupabaseBrowserClient();
      if (!client) throw new Error("Servicio no disponible");
      const request = client.from("devocionales").select("id,titulo,slug,resumen,contenido,introduccion_html,contenido_html,versiculo,categorias,autora,imagen_url,fecha_publicacion,compartidos").eq("publicado", true).order("fecha_publicacion", { ascending: false });
      const { data, error } = await Promise.race([
        request,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Tiempo de espera agotado")), 8000))
      ]);
      if (error) throw error;
      articles = data || [];
      const slug = new URLSearchParams(location.search).get("articulo");
      if (slug) {
        const article = articles.find((item) => item.slug === slug);
        if (article) return renderArticle(article);
        status.textContent = "No encontramos ese devocional.";
      }
      renderList();
    } catch (error) {
      console.error("No se pudieron cargar los devocionales", error);
      status.innerHTML = `<i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i><strong>No pudimos cargar las lecturas</strong><span>Inténtalo nuevamente en unos minutos.</span>`;
    }
  }

  search?.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("es");
    renderList(articles.filter((article) => [article.titulo, article.resumen, article.autora].join(" ").toLocaleLowerCase("es").includes(term)));
  });

  load();
})();
