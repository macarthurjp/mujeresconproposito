// One premium layout for every Mujeres con Propósito email (matches the
// web/app redesign). Email-safe: table layout, inline styles, no web fonts.

const C = {
  bg: "#f6efed",
  card: "#ffffff",
  ink: "#3f2623",
  text: "#4a3330",
  muted: "#7a605d",
  wine: "#a64b43",
  wineDark: "#8f3f38",
  blush: "#fbeae6",
  sand: "#faf5f4",
  line: "#efe3e0",
  gold: "#c9a46b",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SITE = "https://mcp930.org";
const LOGO = `${SITE}/assets/images/email-logo.png`;

export function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** "1988-03-14" → "14 de marzo de 1988" (no time-zone shift). */
export function formatDateEs(iso: string, withYear = true) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || "");
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const text = `${Number(m[3])} de ${months[Number(m[2]) - 1]}`;
  return withYear ? `${text} de ${m[1]}` : text;
}

/** "2026-11-18" → "miércoles 18 de noviembre". */
export function weekdayDateEs(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso || "");
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return `${days[d.getUTCDay()]} ${formatDateEs(iso, false)}`;
}

export function paragraph(html: string) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};">${html}</p>`;
}

/** Label / value rows. Values are escaped; pass { html: true } to inject markup. */
export function infoTable(rows: { label: string; value: string; html?: boolean; accent?: boolean }[]) {
  const body = rows
    .filter((r) => String(r.value ?? "").trim() !== "")
    .map((r, i) => `
      <tr>
        <td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${SANS};font-size:13px;font-weight:600;color:${C.muted};width:38%;vertical-align:top;">${esc(r.label)}</td>
        <td style="padding:12px 16px;${i ? `border-top:1px solid ${C.line};` : ""}font-family:${SANS};font-size:15px;color:${r.accent ? C.wine : C.ink};font-weight:${r.accent ? 700 : 400};vertical-align:top;word-break:break-word;">${r.html ? r.value : esc(r.value)}</td>
      </tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid ${C.line};border-radius:14px;background:${C.card};margin:0 0 20px;">${body}</table>`;
}

/** Highlighted free text (messages, comments). */
export function messageBlock(label: string, text: string) {
  const safe = esc(text).replace(/\n/g, "<br>");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:${C.sand};border-left:3px solid ${C.wine};border-radius:0 14px 14px 0;padding:16px 18px;">
    <div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.wine};margin-bottom:8px;">${esc(label)}</div>
    <div style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.ink};">${safe}</div>
  </td></tr></table>`;
}

/** Scripture / quote with a gold rule. */
export function quoteBlock(text: string, reference: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;"><tr><td style="border-left:3px solid ${C.gold};padding:4px 0 4px 18px;">
    <div style="font-family:${SERIF};font-style:italic;font-size:19px;line-height:1.5;color:${C.ink};">${esc(text)}</div>
    <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${C.wine};margin-top:8px;">${esc(reference)}</div>
  </td></tr></table>`;
}

export function button(label: string, url: string, variant: "primary" | "secondary" = "primary") {
  const primary = variant === "primary";
  return `<a href="${esc(url)}" style="display:inline-block;padding:14px 28px;border-radius:999px;white-space:nowrap;font-family:${SANS};font-size:15px;font-weight:700;text-decoration:none;${primary ? `background:${C.wine};color:#ffffff;` : `background:${C.blush};color:${C.wineDark};`}">${esc(label)}</a>`;
}

export type EmailOptions = {
  preheader: string;
  eyebrow?: string;
  title: string;
  intro?: string; // plain text under the title
  body: string; // HTML built with the helpers above
  actions?: { label: string; url: string; variant?: "primary" | "secondary" }[];
  footnote?: string; // small grey text under the buttons
  footer?: string; // line in the footer under the brand
};

export function renderEmail(o: EmailOptions) {
  const actions = (o.actions || [])
    .map((a) => `<tr><td align="center" style="padding:0 0 10px;">${button(a.label, a.url, a.variant)}</td></tr>`).join("");
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
  <tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
      <tr><td align="center" style="padding:0 0 18px;">
        <a href="${SITE}" style="text-decoration:none;">
          <img src="${LOGO}" width="52" height="52" alt="" style="display:block;border:0;border-radius:14px;margin:0 auto 10px;">
          <span style="font-family:${SERIF};font-size:18px;color:${C.ink};">Mujeres con Propósito</span>
        </a>
      </td></tr>
      <tr><td style="background:${C.card};border-radius:22px;border:1px solid ${C.line};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:32px 32px 8px;">
            ${o.eyebrow ? `<div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.wine};margin-bottom:10px;">${esc(o.eyebrow)}</div>` : ""}
            <h1 style="margin:0 0 ${o.intro ? "10px" : "22px"};font-family:${SERIF};font-weight:400;font-size:30px;line-height:1.2;color:${C.ink};">${esc(o.title)}</h1>
            ${o.intro ? `<p style="margin:0 0 24px;font-family:${SANS};font-size:16px;line-height:1.55;color:${C.muted};">${esc(o.intro)}</p>` : ""}
            ${o.body}
          </td></tr>
          ${actions ? `<tr><td align="center" style="padding:6px 27px 18px;"><table role="presentation" cellpadding="0" cellspacing="0">${actions}</table></td></tr>` : ""}
          ${o.footnote ? `<tr><td align="center" style="padding:0 32px 26px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${o.footnote}</td></tr>` : `<tr><td style="padding:0 0 14px;"></td></tr>`}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 16px 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};">
        ${esc(o.footer || "Fe · Hermandad · Crecimiento · Propósito")}<br>
        <a href="${SITE}" style="color:${C.wine};text-decoration:none;">mcp930.org</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
