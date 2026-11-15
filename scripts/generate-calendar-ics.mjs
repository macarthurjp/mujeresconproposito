#!/usr/bin/env node
// Generates /calendario.ics: a subscribable iCalendar feed with every active
// event as a weekly recurring entry in the event's own time zone. Phones and
// calendar apps that subscribe (webcal://mcp930.org/calendario.ics) refresh it
// on their own, and handle summer/winter time from the TZID.
//
// Run by .github/workflows/sync-share-pages.yml every hour. Output only changes
// when events change (no timestamps that move on every run).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const SUPABASE_URL = "https://jkunywiyiyidhyodsbfh.supabase.co";
const ANON_KEY = "sb_publishable_To7eDo0ZnOqm9AjlkJ7u6A_pNMFvRjX";
const SITE_URL = "https://mcp930.org";
const OUT_FILE = fileURLToPath(new URL("../calendario.ics", import.meta.url));
const SCHEDULE_JS = fileURLToPath(new URL("../assets/js/schedule.js", import.meta.url));
const ANCHOR = { year: 2026, month: 1, day: 1 }; // first DTSTART is the first matching day on/after this date
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Same parser the website uses (assets/js/schedule.js), loaded without a browser.
async function loadSchedule() {
  const context = { window: {}, Intl, Date, console };
  vm.runInNewContext(await readFile(SCHEDULE_JS, "utf8"), context);
  return context.window.MCPSchedule;
}

// VTIMEZONE blocks for the zones events use. Clients also understand the IANA
// TZID on its own, but Outlook needs the definition.
const VTIMEZONES = {
  "America/Santo_Domingo": [
    "BEGIN:VTIMEZONE", "TZID:America/Santo_Domingo",
    "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0400", "TZNAME:AST", "END:STANDARD",
    "END:VTIMEZONE",
  ],
  "Europe/Luxembourg": [
    "BEGIN:VTIMEZONE", "TZID:Europe/Luxembourg",
    "BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "END:STANDARD",
    "END:VTIMEZONE",
  ],
  "America/New_York": [
    "BEGIN:VTIMEZONE", "TZID:America/New_York",
    "BEGIN:DAYLIGHT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "END:STANDARD",
    "END:VTIMEZONE",
  ],
};

function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
    .trim();
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (Buffer.byteLength(current + char, "utf8") > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const pad = (n) => String(n).padStart(2, "0");

function firstMatchingDate(days) {
  const date = new Date(Date.UTC(ANCHOR.year, ANCHOR.month - 1, ANCHOR.day));
  for (let i = 0; i < 7; i += 1) {
    if (days.includes(date.getUTCDay())) break;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function utcStamp(value) {
  const date = value ? new Date(value) : new Date(Date.UTC(ANCHOR.year, 0, 1));
  const safe = Number.isNaN(date.getTime()) ? new Date(Date.UTC(ANCHOR.year, 0, 1)) : date;
  return safe.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function safeLink(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function buildCalendar(eventos, S, birthdays = [], today = new Date()) {
  const zonesUsed = new Set();
  const vevents = [];
  const skipped = [];

  for (const evento of eventos) {
    const schedule = S.parseSchedule(evento.horario);
    if (!schedule) {
      skipped.push(`${evento.titulo} (${evento.horario})`);
      continue;
    }
    const zone = S.zoneFor(evento);
    zonesUsed.add(zone);
    const titulo = String(evento.titulo || "Actividad").trim();
    const link = safeLink(evento.link);
    const start = `${firstMatchingDate(schedule.days)}T${pad(Math.floor(schedule.minutes / 60))}${pad(schedule.minutes % 60)}00`;
    const description = [
      link ? `Únete aquí: ${link}` : "",
      `Horario: ${String(evento.horario || "").trim()}`,
      `Más información: ${SITE_URL}/#events`,
    ].filter(Boolean).join("\n");

    vevents.push([
      "BEGIN:VEVENT",
      `UID:evento-${evento.id}@mcp930.org`,
      `DTSTAMP:${utcStamp(evento.created_at)}`,
      `DTSTART;TZID=${zone}:${start}`,
      "DURATION:PT1H",
      `RRULE:FREQ=WEEKLY;BYDAY=${schedule.days.map((d) => BYDAY[d]).join(",")}`,
      `SUMMARY:${escapeText(titulo)}`,
      `DESCRIPTION:${escapeText(description)}`,
      link ? `URL:${link}` : "",
      `LOCATION:${escapeText(link || "En línea")}`,
      "END:VEVENT",
    ].filter(Boolean));
  }

  // Upcoming birthdays (next 7 days, first name only — same data the public
  // site shows). All-day events; the feed refreshes hourly.
  for (const person of birthdays) {
    const name = String(person.nombreCompleto || "").trim();
    const dias = Number(person.dias);
    if (!name || !Number.isFinite(dias) || dias < 0 || dias > 7) continue;
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + dias));
    const ymd = day.toISOString().slice(0, 10).replace(/-/g, "");
    const next = new Date(day.getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    vevents.push([
      "BEGIN:VEVENT",
      `UID:cumple-${ymd}-${name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}@mcp930.org`,
      `DTSTAMP:${utcStamp()}`,
      `DTSTART;VALUE=DATE:${ymd}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeText(`🎂 Cumpleaños de ${name}`)}`,
      `DESCRIPTION:${escapeText(`Hoy celebramos el cumpleaños de ${name}. ¡No olvides felicitarla!`)}`,
      "TRANSP:TRANSPARENT",
      // Default reminder: the day before at 09:00 (all-day events start at 00:00).
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Mañana es el cumpleaños de ${name}`)}`,
      "TRIGGER:-PT15H",
      "END:VALARM",
      "END:VEVENT",
    ]);
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mujeres con Proposito 930//Calendario de actividades//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mujeres con Propósito",
    `X-WR-CALDESC:${escapeText("Actividades y reuniones de Mujeres con Propósito. Se actualiza automáticamente.")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...[...zonesUsed].sort().flatMap((zone) => VTIMEZONES[zone] || []),
    ...vevents.flat(),
    "END:VCALENDAR",
  ];

  return { ics: lines.map(fold).join("\r\n") + "\r\n", count: vevents.length, skipped };
}

async function main() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/eventos?select=*&activa=eq.true&order=orden.asc`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!response.ok) throw new Error(`Supabase respondió ${response.status}`);
  const eventos = await response.json();
  const S = await loadSchedule();
  let birthdays = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-today-birthdays`, { headers: { apikey: ANON_KEY } });
    const data = res.ok ? await res.json() : {};
    birthdays = Array.isArray(data.proximosCumpleanos) ? data.proximosCumpleanos : [];
  } catch (error) {
    console.warn("No se pudieron leer los cumpleaños:", error?.message || error);
  }
  const lux = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Luxembourg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const { ics, count, skipped } = buildCalendar(eventos, S, birthdays, new Date(`${lux}T00:00:00Z`));
  await writeFile(OUT_FILE, ics, "utf8");
  console.log(`calendario.ics: ${count} eventos (incluye ${birthdays.length} cumpleaños).`);
  if (skipped.length) console.log(`Horarios no reconocidos (omitidos): ${skipped.join("; ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
