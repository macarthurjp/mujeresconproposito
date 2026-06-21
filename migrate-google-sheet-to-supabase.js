#!/usr/bin/env node

// Script de migración: Google Sheets -> Supabase
// Uso:
//   1) Configura las variables de entorno en un archivo .env o exportándolas.
//   2) Ejecuta: node migrate-google-sheet-to-supabase.js
// O bien: SHEET_CSV_URL="..." SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." node migrate-google-sheet-to-supabase.js
// También admite argumentos: --csv-url y --table.

const args = process.argv.slice(2);
const getArg = (name) => {
  const index = args.findIndex((arg) => arg === name);
  if (index === -1 || index + 1 >= args.length) return undefined;
  return args[index + 1];
};

const SHEET_CSV_URL = getArg("--csv-url") || process.env.SHEET_CSV_URL || "";
const SUPABASE_URL = getArg("--supabase-url") || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = getArg("--service-role-key") || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TABLE_NAME = getArg("--table") || process.env.SUPABASE_TABLE || "members";
const BATCH_SIZE = Number(process.env.BATCH_SIZE || 50);

if (!SHEET_CSV_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Por favor configura SHEET_CSV_URL, SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Ejemplo: SHEET_CSV_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node migrate-google-sheet-to-supabase.js");
  process.exit(1);
}

function parseCsv(text) {
  const lines = [];
  let current = [];
  let field = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      current.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (field !== "" || current.length > 0) {
        current.push(field);
        lines.push(current);
        current = [];
        field = "";
      }
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      continue;
    }

    field += char;
  }

  if (field !== "" || current.length > 0) {
    current.push(field);
    lines.push(current);
  }
  return lines;
}

function normalizeRow(row) {
  return row.map((cell) => String(cell || "").trim());
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(header) {
  const value = normalizeKey(header);
  const mapping = {
    nombre: "nombre",
    apellido: "apellido",
    email: "email",
    correo: "email",
    telefono: "telefono",
    "telefono celular": "telefono",
    "fecha de nacimiento": "fecha_nacimiento",
    nacimiento: "fecha_nacimiento",
    "estatus matrimonial": "estatus_matrimonial",
    "estado civil": "estatus_matrimonial",
    "pais de nacimiento": "pais_nacimiento",
    "pais nacimiento": "pais_nacimiento",
    "pais de residencia": "pais_residencia",
    "pais residencia": "pais_residencia",
    cristiana: "cristiana",
    comunidad: "comunidad"
  };
  return mapping[value] || null;
}

function buildMemberRecord(headers, row) {
  const record = {};
  headers.forEach((header, index) => {
    const target = normalizeHeader(header);
    if (target) {
      record[target] = row[index] || null;
    }
  });
  record.source = "sheets";
  return record;
}

async function fetchCsv(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "text/csv"
    }
  });

  if (!response.ok) {
    throw new Error(`Error al descargar CSV: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function insertBatch(records) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE_NAME}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(records)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert error (${response.status}): ${text}`);
  }

  return response;
}

async function main() {
  console.log("Descargando Google Sheet...");
  const csvText = await fetchCsv(SHEET_CSV_URL);
  const rows = parseCsv(csvText).map(normalizeRow);

  if (!rows.length) {
    console.error("No se encontró contenido en el CSV.");
    process.exit(1);
  }

  const headers = rows[0].map((h) => String(h || "").trim());
  const dataRows = rows.slice(1).filter((row) => row.some((cell) => String(cell || "").trim() !== ""));

  if (!dataRows.length) {
    console.error("No hay registros válidos para migrar.");
    process.exit(1);
  }

  const records = dataRows.map((row) => buildMemberRecord(headers, row));
  console.log(`Registros detectados: ${records.length}`);

  const missingColumns = headers
    .map((header) => ({ header, normalized: normalizeHeader(header) }))
    .filter((item) => item.normalized === null)
    .map((item) => item.header);

  if (missingColumns.length) {
    console.log("Encabezados sin mapeo detectados:", missingColumns.join(", "));
    console.log("Verifica que tus columnas coincidan con los campos del formulario.");
  }

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    console.log(`Insertando lote ${i + 1}-${i + batch.length}...`);
    await insertBatch(batch);
  }

  console.log("Migración completada correctamente.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
