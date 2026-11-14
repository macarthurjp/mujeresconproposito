// Date helpers for birthday jobs. All "today" logic uses Luxembourg time,
// matching the existing send-birthday-emails function.

const ZONE = "Europe/Luxembourg";

function parts(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, ...options }).formatToParts(date);
}

export function luxembourgTodayISO(now = new Date()) {
  const p = parts(now, { year: "numeric", month: "2-digit", day: "2-digit" });
  const get = (t: string) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function luxembourgHour(now = new Date()) {
  const p = parts(now, { hour: "2-digit", hourCycle: "h23" });
  return Number(p.find((x) => x.type === "hour")?.value || "0") % 24;
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * True when a birth date (YYYY-MM-DD) is celebrated on targetISO.
 * People born on 29 February are celebrated on 28 February in non-leap years.
 */
export function birthdayMatches(birthISO: string, targetISO: string) {
  const birthMD = String(birthISO).slice(5, 10);
  const targetMD = targetISO.slice(5, 10);
  if (birthMD === targetMD) return true;
  return birthMD === "02-29" && targetMD === "02-28" && !isLeapYear(Number(targetISO.slice(0, 4)));
}
