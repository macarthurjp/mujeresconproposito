#!/usr/bin/env node

// Migrates existing image URLs from Supabase tables into Supabase Storage.
// Usage:
//   SUPABASE_URL="https://..." SUPABASE_SERVICE_ROLE_KEY="..." node migrate-images-to-supabase-storage.js

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.findIndex((arg) => arg === name);
  if (index === -1 || index + 1 >= args.length) return "";
  return args[index + 1];
};

const SUPABASE_URL = getArg("--supabase-url") || process.env.SUPABASE_URL || "https://jkunywiyiyidhyodsbfh.supabase.co";
const SERVICE_ROLE_KEY = getArg("--service-role-key") || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = "mcp930-images";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de correr este script.");
  console.error('Ejemplo: SUPABASE_SERVICE_ROLE_KEY="..." node migrate-images-to-supabase-storage.js');
  process.exit(1);
}

const restHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
};

function isStorageUrl(value) {
  return String(value || "").includes(`/storage/v1/object/public/${BUCKET}/`);
}

function isMigratableImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || url === "✦" || isStorageUrl(url)) return false;
  return /^https?:\/\//i.test(url);
}

function sanitizeName(value) {
  return String(value || "image")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function extensionFromType(contentType) {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  if (/gif/i.test(contentType)) return "gif";
  if (/svg/i.test(contentType)) return "svg";
  return "jpg";
}

function fileNameFromUrl(url, fallback, contentType) {
  try {
    const parsed = new URL(url);
    const last = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    const cleanLast = sanitizeName(last);
    if (cleanLast && cleanLast.includes(".")) return cleanLast;
  } catch (_) {
    // Fall through to fallback.
  }

  return `${sanitizeName(fallback)}.${extensionFromType(contentType)}`;
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      ...restHeaders,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${text}`);
  }

  return response;
}

async function fetchRows(table, columns) {
  const response = await supabaseFetch(`/rest/v1/${table}?select=${columns}&limit=1000`);
  return response.json();
}

async function updateRow(table, id, values) {
  await supabaseFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(values),
  });
}

async function uploadImageUrl(sourceUrl, folder, fallbackName) {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 MCP930 image migration",
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudo descargar ${sourceUrl} (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = fileNameFromUrl(sourceUrl, fallbackName, contentType);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;

  await supabaseFetch(`/storage/v1/object/${BUCKET}/${encodeURIComponent(path).replace(/%2F/g, "/")}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "3600",
      "x-upsert": "false",
    },
    body: buffer,
  });

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function migrateTable({ table, folder, urlColumn, nameColumn }) {
  const rows = await fetchRows(table, `id,${urlColumn},${nameColumn || "id"}`);
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`\n${table}: ${rows.length} filas detectadas`);

  for (const row of rows) {
    const currentUrl = row[urlColumn];
    if (!isMigratableImageUrl(currentUrl)) {
      skipped += 1;
      continue;
    }

    try {
      const publicUrl = await uploadImageUrl(currentUrl, folder, row[nameColumn] || row.id);
      await updateRow(table, row.id, { [urlColumn]: publicUrl });
      migrated += 1;
      console.log(`  OK ${migrated}: ${row[nameColumn] || row.id}`);
    } catch (error) {
      failed += 1;
      console.error(`  ERROR ${row.id}: ${error.message}`);
    }
  }

  console.log(`${table}: migradas ${migrated}, omitidas ${skipped}, fallidas ${failed}`);
}

async function main() {
  await migrateTable({
    table: "destacadas",
    folder: "destacadas",
    urlColumn: "foto_url",
    nameColumn: "nombre",
  });

  await migrateTable({
    table: "galeria",
    folder: "galeria",
    urlColumn: "foto_url",
    nameColumn: "texto",
  });

  await migrateTable({
    table: "eventos",
    folder: "eventos",
    urlColumn: "icono",
    nameColumn: "titulo",
  });

  console.log("\nMigración de imágenes completada.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
