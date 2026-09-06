#!/usr/bin/env node
// Genera un archivo HTML estático por destacada activa, con las etiquetas
// Open Graph correctas (nombre/foto/descripción), en /i/<id>.html.
// Mismo motivo que generate-share-pages.mjs: Supabase Storage fuerza un
// Content-Type/CSP que impide que los bots de vista previa procesen el
// contenido servido directamente desde *.supabase.co.

import { mkdir, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
const SITE_URL = "https://mcp930.org";
const DEFAULT_IMAGE = `${SITE_URL}/assets/images/og-preview.png`;
const DEFAULT_DESCRIPTION = "Una comunidad cristiana internacional donde la fe, la hermandad y el propósito se unen para transformar vidas.";
const OUT_DIR = fileURLToPath(new URL("../i/", import.meta.url));

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
  <meta property="og:type" content="profile" />
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
  <p>Abriendo… <a href="${safeTargetUrl}">Continuar</a></p>
</body>
</html>
`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const query = `${SUPABASE_URL}/rest/v1/destacadas?select=id,nombre,titulo,foto_url&activa=eq.true`;
  const response = await fetch(query, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
  const invitees = await response.json();

  const validFiles = new Set();
  for (const invitee of invitees) {
    if (!invitee.id) continue;
    const fileName = `${invitee.id}.html`;
    validFiles.add(fileName);
    const image = typeof invitee.foto_url === "string" && invitee.foto_url.startsWith("http")
      ? invitee.foto_url
      : DEFAULT_IMAGE;
    const targetUrl = `${SITE_URL}/index.html?invitada=${encodeURIComponent(invitee.id)}#invitees`;
    const html = buildPage({
      title: `${invitee.nombre || "Destacada"} — Mujeres con Propósito`,
      description: invitee.titulo ? `${invitee.titulo} — Mujeres con Propósito.` : DEFAULT_DESCRIPTION,
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

  console.log(`Generados ${validFiles.size} archivos de vista previa en /i`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
