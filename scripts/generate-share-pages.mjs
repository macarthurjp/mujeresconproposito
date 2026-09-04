#!/usr/bin/env node
// Genera un archivo HTML estático por devocional publicado, con las etiquetas
// Open Graph correctas (título/imagen/descripción), en /d/<slug>.html.
// Se sirve desde mcp930.org (GitHub Pages) porque Supabase Functions/Storage
// fuerzan Content-Type: text/plain + un CSP bloqueado en sus respuestas, lo
// que impide que un navegador o un bot de vista previa procese HTML servido
// desde *.supabase.co.

import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
const SITE_URL = "https://mcp930.org";
const DEFAULT_IMAGE = `${SITE_URL}/assets/images/og-preview.png`;
const DEFAULT_DESCRIPTION = "Reflexiones y devocionales para fortalecer tu caminar con Dios.";
const OUT_DIR = fileURLToPath(new URL("../d/", import.meta.url));

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPage({ title, description, image, imageIsDefault, targetUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeTargetUrl = escapeHtml(targetUrl);
  const imageDimensions = imageIsDefault
    ? `\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Mujeres con Propósito" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:url" content="${safeTargetUrl}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:secure_url" content="${safeImage}" />${imageDimensions}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <meta http-equiv="refresh" content="0;url=${safeTargetUrl}" />
  <script>location.replace(${JSON.stringify(targetUrl)});</script>
</head>
<body>
  <p>Abriendo el devocional… <a href="${safeTargetUrl}">Continuar</a></p>
</body>
</html>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const query = `${SUPABASE_URL}/rest/v1/devocionales?select=slug,titulo,resumen,versiculo,imagen_url&publicado=eq.true`;
  const response = await fetch(query, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
  const articles = await response.json();

  const validFiles = new Set();
  for (const article of articles) {
    if (!article.slug) continue;
    const fileName = `${article.slug}.html`;
    validFiles.add(fileName);
    const image = typeof article.imagen_url === "string" && article.imagen_url.startsWith("http")
      ? article.imagen_url
      : DEFAULT_IMAGE;
    const targetUrl = `${SITE_URL}/devocionales.html?articulo=${encodeURIComponent(article.slug)}`;
    const html = buildPage({
      title: `${article.titulo || "Devocional"} — Mujeres con Propósito`,
      description: article.resumen || article.versiculo || DEFAULT_DESCRIPTION,
      image,
      imageIsDefault: image === DEFAULT_IMAGE,
      targetUrl,
    });
    await writeFile(path.join(OUT_DIR, fileName), html, "utf8");
  }

  const existing = await readdir(OUT_DIR).catch(() => []);
  for (const file of existing) {
    if (!file.endsWith(".html") || validFiles.has(file)) continue;
    await rm(path.join(OUT_DIR, file));
  }

  console.log(`Generados ${validFiles.size} archivos de vista previa en /d`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
