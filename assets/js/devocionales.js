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

  const PAGE_SIZE = 9;
  let shown = PAGE_SIZE;
  const flowerSvg = '<svg viewBox="14 2 269 452" aria-hidden="true"><use href="#dvFlower"></use></svg>';

  function cleanVerse(value) {
    return String(value || "").trim().replace(/^["“”«]+|["“”»]+$/g, "").replace(/["“”]\s*(—|-)/, " —");
  }

  function splitVerse(value) {
    const text = cleanVerse(value);
    const match = text.match(/^(.*?)[\s"“”]*[—–-]\s*([^—–-]+\d[\d:.,\s-]*)$/);
    return match ? { text: match[1].replace(/["“”]+$/, "").trim(), ref: match[2].trim() } : { text, ref: "" };
  }

  function category(article) {
    return (Array.isArray(article.categorias) && article.categorias[0]) || "Devocional";
  }

  function cover(article, eager = false) {
    const fallback = `<div class="dv-cover-fallback"><span class="dv-cover-flower">${flowerSvg}</span><span class="dv-cover-cat">${escapeHtml(category(article))}</span></div>`;
    if (!article.imagen_url || !/^https:\/\//i.test(article.imagen_url)) return fallback;
    return `${fallback}<img src="${escapeHtml(article.imagen_url)}" alt="" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" onerror="this.remove()" onload="this.classList.add('is-loaded')" />`;
  }

  function byline(article) {
    const minutes = estimateReadMinutes(article.contenido_html || article.contenido);
    return `<span class="dv-byline"><span class="dv-avatar" aria-hidden="true">${escapeHtml(publisherInitials(article))}</span><span>${escapeHtml(publisherName(article))}</span><span class="dv-dot" aria-hidden="true">·</span><span>${minutes} min</span></span>`;
  }

  function articleCard(article) {
    return `<article class="dv-card">
      <a href="?articulo=${encodeURIComponent(article.slug)}" aria-label="Leer ${escapeHtml(article.titulo)}">
        <div class="dv-cover">${cover(article)}</div>
        <div class="dv-card-body">
          <span class="dv-date">${escapeHtml(formatDate(article.fecha_publicacion))}</span>
          <h3>${escapeHtml(article.titulo)}</h3>
          <p>${escapeHtml(article.resumen || "Una nueva reflexión para acompañar tu caminar con Dios.")}</p>
          ${byline(article)}
        </div>
      </a>
    </article>`;
  }

  function featuredArticle(article) {
    return `<article class="dv-featured">
      <a href="?articulo=${encodeURIComponent(article.slug)}" aria-label="Leer ${escapeHtml(article.titulo)}">
        <div class="dv-cover dv-featured-cover">${cover(article, true)}</div>
        <div class="dv-featured-copy">
          <span class="dv-badge"><i class="fa-solid fa-star" aria-hidden="true"></i> Lectura destacada</span>
          <span class="dv-date">${escapeHtml(formatDate(article.fecha_publicacion))} · ${escapeHtml(category(article))}</span>
          <h2>${escapeHtml(article.titulo)}</h2>
          <p>${escapeHtml(article.resumen || "Una nueva reflexión para acompañar tu caminar con Dios.")}</p>
          <span class="dv-featured-foot">${byline(article)}<span class="dv-cta">Leer reflexión <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span></span>
        </div>
      </a>
    </article>`;
  }

  function renderList(items) {
    const visible = items || articles;
    const isFiltering = Boolean(search?.value.trim());
    featured.innerHTML = !isFiltering && visible[0] ? featuredArticle(visible[0]) : "";
    const cards = !isFiltering ? visible.slice(1) : visible;
    grid.innerHTML = cards.slice(0, shown).map(articleCard).join("");
    const more = document.getElementById("devMore");
    if (more) more.hidden = cards.length <= shown;
    const count = document.getElementById("devCount");
    if (count) count.textContent = String(cards.length);
    collectionHead.hidden = cards.length === 0;
    status.hidden = visible.length > 0;
    if (!visible.length) status.innerHTML = `<span class="dv-status-icon"><i class="fa-solid fa-feather-pointed" aria-hidden="true"></i></span><strong>${isFiltering ? "No encontramos coincidencias" : "Estamos preparando algo especial"}</strong><span>${isFiltering ? "Prueba con otra palabra o autora." : "Muy pronto encontrarás aquí reflexiones escritas con fe y propósito."}</span>`;
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
      if (icon) icon.className = `fa-${pressed ? "solid" : "regular"} fa-bookmark`;
      const label = button.querySelector("[data-fav-label]");
      if (label) label.textContent = pressed ? "Guardado" : "Guardar";
    });
  }

  function initReadingProgress() {
    const content = document.getElementById("devArticleContent");
    const fill = document.getElementById("dvProgress");
    if (!content || !fill) return;
    document.body.classList.add("dv-reading");
    function update() {
      const rect = content.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight * 0.6);
      const pct = Math.min(1, Math.max(0, (window.innerHeight * 0.25 - rect.top) / total));
      fill.style.transform = `scaleX(${pct})`;
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
    initReadingProgress();
  }

  function trackRead(slug) {
    try {
      const key = `mcp-dv-read-${slug}-${new Date().toISOString().slice(0, 10)}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (_) {}
    window.McpSupabase?.getSupabaseBrowserClient()?.rpc("registrar_metrica", { p_tipo: "lectura_devocional", p_ref: slug }).then(() => {}, () => {});
  }

  function renderArticle(article) {
    trackRead(article.slug);
    document.title = `${article.titulo} — Mujeres con Propósito`;
    document.getElementById("dvIntro").hidden = true;
    const readMinutes = estimateReadMinutes(article.contenido_html || article.contenido);
    const favored = isFavorite(article.slug);
    const verse = article.versiculo ? splitVerse(article.versiculo) : null;
    const hasImage = article.imagen_url && /^https:\/\//i.test(article.imagen_url);
    const plain = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const showLead = article.introduccion_html && plain(article.introduccion_html) !== plain(article.resumen);
    const others = articles.filter((item) => item.slug !== article.slug).slice(0, 3);
    document.getElementById("lecturas").innerHTML = `<article class="dv-article">
      <a href="devocionales.html" class="dv-back"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Devocionales</a>
      <header class="dv-article-head">
        <span class="dv-eyebrow">${escapeHtml(category(article))}</span>
        <h1>${escapeHtml(article.titulo)}</h1>
        ${article.resumen ? `<p class="dv-dek">${escapeHtml(article.resumen)}</p>` : ""}
        <div class="dv-article-meta">
          <span class="dv-avatar dv-avatar-lg" aria-hidden="true">${escapeHtml(publisherInitials(article))}</span>
          <span class="dv-article-meta-copy"><strong>${escapeHtml(publisherName(article))}</strong><span>${escapeHtml(formatDate(article.fecha_publicacion))} · ${readMinutes} min de lectura</span></span>
          <span class="dv-tools">
            <button type="button" class="dv-tool" data-share aria-label="Compartir"><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i></button>
            <button type="button" class="dv-tool" data-fav-toggle aria-pressed="${favored}" aria-label="Guardar en favoritos"><i class="fa-${favored ? "solid" : "regular"} fa-bookmark" aria-hidden="true"></i></button>
          </span>
        </div>
      </header>
      ${hasImage ? `<figure class="dv-hero-figure"><img src="${escapeHtml(article.imagen_url)}" alt="${escapeHtml(article.cover_alt || article.titulo || "")}" onerror="this.closest('figure').remove()" /></figure>` : ""}
      <div class="dv-body" id="devArticleContent">
        ${verse && verse.text ? `<figure class="dv-pullquote"><blockquote>${escapeHtml(verse.text)}</blockquote>${verse.ref ? `<figcaption>${escapeHtml(verse.ref)}</figcaption>` : ""}</figure>` : ""}
        ${showLead ? `<div class="dv-lead">${safeRichHtml(article.introduccion_html, "")}</div>` : ""}
        <div class="dv-prose">${safeRichHtml(article.contenido_html, article.contenido)}</div>
        ${article.oracion_html ? `<section class="dv-closing-prayer" aria-labelledby="devClosingPrayerTitle">
          <h2 id="devClosingPrayerTitle"><i class="fa-solid fa-hands-praying" aria-hidden="true"></i> Oración</h2>
          <div class="dv-closing-prayer-text">${safeRichHtml(article.oracion_html, "")}</div>
        </section>` : ""}
        <div class="dv-article-actions">
          <button type="button" class="dv-action" data-share><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> Compartir</button>
          <button type="button" class="dv-action dv-action-primary" data-fav-toggle aria-pressed="${favored}"><i class="fa-${favored ? "solid" : "regular"} fa-bookmark" aria-hidden="true"></i> <span data-fav-label>${favored ? "Guardado" : "Guardar"}</span></button>
          <span class="dv-share-count" id="devShareCount" hidden></span>
        </div>
        <section class="dv-panel dv-notes">
          <h2><i class="fa-regular fa-pen-to-square" aria-hidden="true"></i> Mis notas</h2>
          <p>Se guardan solo en este dispositivo.</p>
          <textarea id="devNotesInput" rows="4" placeholder="¿Qué te habló Dios hoy?"></textarea>
        </section>
        <a class="dv-panel dv-prayer" href="index.html#oracion">
          <span class="dv-prayer-icon"><i class="fa-solid fa-hands-praying" aria-hidden="true"></i></span>
          <span><strong>¿Necesitas oración?</strong><small>Escríbenos tu petición. Nuestro equipo orará por ti con cariño.</small></span>
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </a>
      </div>
      ${others.length ? `<section class="dv-next"><div class="dv-section-head"><div><span class="dv-eyebrow">Sigue leyendo</span><h2>Más reflexiones</h2></div></div><div class="dv-grid">${others.map(articleCard).join("")}</div></section>` : ""}
    </article>`;
    window.scrollTo(0, 0);
    initArticleInteractions(article);
  }

  async function load() {
    try {
      const client = window.McpSupabase?.getSupabaseBrowserClient();
      if (!client) throw new Error("Servicio no disponible");
      const request = client.from("devocionales").select("id,titulo,slug,resumen,contenido,introduccion_html,contenido_html,versiculo,categorias,autora,imagen_url,cover_alt,oracion_html,fecha_publicacion,compartidos").eq("publicado", true).order("fecha_publicacion", { ascending: false });
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

  document.getElementById("devMore")?.addEventListener("click", () => {
    shown += PAGE_SIZE;
    renderList();
  });

  search?.addEventListener("input", () => {
    const term = search.value.trim().toLocaleLowerCase("es");
    renderList(articles.filter((article) => [article.titulo, article.resumen, article.autora].join(" ").toLocaleLowerCase("es").includes(term)));
  });

  load();
})();
