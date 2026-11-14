// Event schedule helpers for the browser (window.MCPSchedule).
// Same parsing rules as supabase/functions/_shared/schedule.ts (keep in sync).
// Turns "Domingos · 4:00 PM" written in an event's own time zone into real
// instants, then formats them in the visitor's local time, so summer/winter
// time changes are handled automatically by the browser's time-zone data.
(function () {
  "use strict";

  var DAY_INDEX = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  var DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var DEFAULT_ZONE = "America/Santo_Domingo";
  var EUROPE_ZONE = "Europe/Luxembourg";

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function parseTime(text) {
    var value = normalize(text);
    var twelve = value.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?\s*m\.?(?![a-z])/);
    if (twelve) {
      var hour = Number(twelve[1]) % 12;
      if (twelve[3] === "p") hour += 12;
      return hour * 60 + Number(twelve[2] || 0);
    }
    var european = value.match(/\b([01]?\d|2[0-3])\s*h\s*([0-5]\d)?\b/);
    if (european) return Number(european[1]) * 60 + Number(european[2] || 0);
    var clock = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
    return null;
  }

  function parseDays(text) {
    var value = normalize(text);
    if (/\b(diario|diariamente|todos los dias|cada dia)\b/.test(value)) return [0, 1, 2, 3, 4, 5, 6];
    if (/\b(lunes a viernes|entre semana)\b/.test(value)) return [1, 2, 3, 4, 5];
    var found = [];
    Object.keys(DAY_INDEX).forEach(function (name) {
      if (new RegExp("\\b" + name + "s?\\b").test(value)) found.push(DAY_INDEX[name]);
    });
    return found.sort();
  }

  function parseSchedule(text) {
    var minutes = parseTime(text);
    var days = parseDays(text);
    if (minutes === null || !days.length) return null;
    return { days: days, minutes: minutes };
  }

  function isValidZone(zone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch (e) { return false; }
  }

  // Zone the schedule text is written in. Uses the event's zona_horaria when
  // present; otherwise "Europa" events are Luxembourg time, the rest RD time.
  function zoneFor(event) {
    var zone = event && (event.zona_horaria || event.zonaHoraria);
    if (zone && isValidZone(zone)) return zone;
    var title = normalize(event && (event.titulo || event.title || ""));
    return /\beurop/.test(title) ? EUROPE_ZONE : DEFAULT_ZONE;
  }

  function localParts(instant, zone) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short"
    }).formatToParts(instant);
    var get = function (type) { var p = parts.find(function (x) { return x.type === type; }); return p ? p.value : ""; };
    return {
      year: Number(get("year")), month: Number(get("month")), day: Number(get("day")),
      hour: Number(get("hour")) % 24, minute: Number(get("minute")), weekday: WEEKDAYS.indexOf(get("weekday"))
    };
  }

  function zonedToUtc(year, month, day, minutes, zone) {
    var guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
    var utc = guess;
    for (var i = 0; i < 2; i += 1) {
      var p = localParts(new Date(utc), zone);
      utc = guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utc);
    }
    return new Date(utc);
  }

  /** Occurrence instants between `from` and `from + days` (sorted). */
  function occurrences(event, from, days) {
    var schedule = parseSchedule(event && (event.horario || event.schedule));
    if (!schedule) return [];
    var zone = zoneFor(event);
    var out = [];
    for (var offset = -1; offset <= days + 1; offset += 1) {
      var local = localParts(new Date(from.getTime() + offset * 86400000), zone);
      if (schedule.days.indexOf(local.weekday) === -1) continue;
      var start = zonedToUtc(local.year, local.month, local.day, schedule.minutes, zone);
      if (start >= from && start < new Date(from.getTime() + days * 86400000)) out.push(start);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function dayLabel(days) {
    var sorted = days.slice().sort();
    if (sorted.length === 7) return "Diario";
    if (sorted.join(",") === "1,2,3,4,5") return "Lunes a Viernes";
    var names = sorted.map(function (d) { return DAY_NAMES[d]; });
    if (names.length === 1) return /s$/.test(names[0]) ? names[0] : names[0] + "s";
    return names.slice(0, -1).join(", ") + " y " + names[names.length - 1];
  }

  /**
   * Schedule re-expressed in the visitor's local time, e.g. "Domingos · 21:00".
   * Returns null when the text can't be parsed (callers then show it as-is).
   */
  function localScheduleLabel(event, now) {
    var schedule = parseSchedule(event && (event.horario || event.schedule));
    if (!schedule) return null;
    var list = occurrences(event, now || new Date(), 7);
    if (!list.length) return null;
    var days = [];
    list.forEach(function (d) { if (days.indexOf(d.getDay()) === -1) days.push(d.getDay()); });
    return dayLabel(days) + " · " + formatTime(list[0]);
  }

  window.MCPSchedule = {
    parseSchedule: parseSchedule,
    zoneFor: zoneFor,
    occurrences: occurrences,
    formatTime: formatTime,
    localScheduleLabel: localScheduleLabel,
    dayName: function (date) { return DAY_NAMES[date.getDay()]; }
  };
})();
