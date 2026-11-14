import { assertEquals } from "jsr:@std/assert@1";
import { parseSchedule, parseTime, startedOccurrence } from "./schedule.ts";

Deno.test("parses admin and legacy schedule formats", () => {
  assertEquals(parseSchedule("Martes · 19h"), { days: [2], minutes: 19 * 60 });
  assertEquals(parseSchedule("Lunes y Jueves · 20h30"), { days: [1, 4], minutes: 20 * 60 + 30 });
  assertEquals(parseSchedule("Diario · 7h"), { days: [0, 1, 2, 3, 4, 5, 6], minutes: 7 * 60 });
  assertEquals(parseSchedule("Sábados · 3:00 PM"), { days: [6], minutes: 15 * 60 });
  assertEquals(parseSchedule("Domingo · 4:00 PM"), { days: [0], minutes: 16 * 60 });
  assertEquals(parseSchedule("Miércoles 12:30 a.m."), { days: [3], minutes: 30 });
  assertEquals(parseSchedule("Próximamente"), null);
  assertEquals(parseTime("10h"), 600);
  assertEquals(parseTime("12:00 PM"), 720);
});

Deno.test("detects a meeting that just started in its time zone", () => {
  const schedule = parseSchedule("Martes · 19h")!;
  // Tuesday 2026-11-17 19:03 in Luxembourg (UTC+1) = 18:03 UTC
  const now = new Date("2026-11-17T18:03:00Z");
  assertEquals(startedOccurrence(schedule, "Europe/Luxembourg", now)?.toISOString(), "2026-11-17T18:00:00.000Z");
  // Same instant, New York zone: 13:03 local -> not started window
  assertEquals(startedOccurrence(schedule, "America/New_York", now), null);
  // 15 minutes late is outside the 10 minute window
  assertEquals(startedOccurrence(schedule, "Europe/Luxembourg", new Date("2026-11-17T18:15:00Z")), null);
});

Deno.test("handles summer time and late-night meetings", () => {
  const schedule = parseSchedule("Sábado · 23h55")!;
  // Saturday 2026-07-04 23:55 CEST (UTC+2) = 21:55 UTC; check at 00:02 local Sunday
  const now = new Date("2026-07-04T22:02:00Z");
  assertEquals(startedOccurrence(schedule, "Europe/Luxembourg", now)?.toISOString(), "2026-07-04T21:55:00.000Z");
});
