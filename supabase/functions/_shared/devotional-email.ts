// Rich summary of a devotional for editorial emails (reviewers and authors):
// cover, title, verse, a short excerpt of the reflection and the categories.
import { esc, quoteBlock } from "./email-layout.ts";

const C = { ink: "#3f2623", muted: "#6d5250", wine: "#a64b43", line: "rgba(63,38,35,0.10)", sand: "#fbf1ec" };
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

export type DevotionalFields = {
  titulo?: string | null;
  versiculo?: string | null;
  contenido?: string | null;
  contenido_html?: string | null;
  introduccion_html?: string | null;
  resumen?: string | null;
  categorias?: string[] | null;
  imagen_url?: string | null;
  cover_alt?: string | null;
};

/** Pending copy if present, otherwise the live columns. */
export function devotionalFields(row: Record<string, unknown> | null | undefined): DevotionalFields {
  const r = (row || {}) as Record<string, unknown>;
  const p = (r.pending_content || {}) as Record<string, unknown>;
  const pick = (k: string) => (p[k] !== undefined && p[k] !== null && p[k] !== "" ? p[k] : r[k]) as never;
  return {
    titulo: pick("titulo"), versiculo: pick("versiculo"), contenido: pick("contenido"), contenido_html: pick("contenido_html"),
    introduccion_html: pick("introduccion_html"), resumen: pick("resumen"), categorias: pick("categorias"),
    imagen_url: pick("imagen_url"), cover_alt: pick("cover_alt"),
  };
}

function plain(html?: string | null) {
  return String(html || "").replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h\d)>/gi, " ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

export function excerpt(f: DevotionalFields, max = 320) {
  const text = plain(f.contenido_html) || plain(f.contenido) || plain(f.introduccion_html) || plain(f.resumen);
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")}…` : text;
}

/** "texto — Referencia" → quote block; anything else → plain quote. */
function verseBlock(verse?: string | null) {
  const v = String(verse || "").trim();
  if (!v) return "";
  const [text, ref] = v.split(/\s+[—–-]\s+(?=[^—–-]+$)/);
  return quoteBlock(text.replace(/^[“"]|[”"]$/g, ""), ref || "");
}

export function devotionalSummaryHtml(f: DevotionalFields) {
  const img = f.imagen_url && /^https:\/\//.test(f.imagen_url)
    ? `<img src="${esc(f.imagen_url)}" alt="${esc(f.cover_alt || f.titulo || "")}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:16px;margin:0 0 18px;" />`
    : "";
  const cats = (f.categorias || []).filter(Boolean);
  const chips = cats.length
    ? `<div style="margin:0 0 16px;">${cats.map((c) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;background:${C.sand};font-family:${SANS};font-size:12px;font-weight:700;color:${C.wine};">${esc(c)}</span>`).join("")}</div>`
    : "";
  const text = excerpt(f);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:18px;margin:0 0 22px;"><tr><td style="padding:20px 20px 6px;">
    ${img}
    <div style="font-family:${SERIF};font-size:22px;line-height:1.3;color:${C.ink};margin:0 0 12px;">${esc(f.titulo || "Sin título")}</div>
    ${chips}
    ${verseBlock(f.versiculo)}
    ${text ? `<div style="font-family:${SANS};font-size:15px;line-height:1.65;color:${C.muted};margin:0 0 16px;">${esc(text)}</div>` : ""}
  </td></tr></table>`;
}
