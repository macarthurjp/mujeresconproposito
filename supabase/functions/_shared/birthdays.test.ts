import { assertEquals } from "jsr:@std/assert@1";
import { addDaysISO, birthdayMatches, luxembourgHour, luxembourgTodayISO } from "./birthdays.ts";

Deno.test("adds days across month and year boundaries", () => {
  assertEquals(addDaysISO("2026-11-14", 2), "2026-11-16");
  assertEquals(addDaysISO("2026-11-30", 2), "2026-12-02");
  assertEquals(addDaysISO("2026-12-31", 2), "2027-01-02");
  assertEquals(addDaysISO("2028-02-27", 2), "2028-02-29");
});

Deno.test("matches birthdays by month and day, with 29 Feb fallback", () => {
  assertEquals(birthdayMatches("1985-11-16", "2026-11-16"), true);
  assertEquals(birthdayMatches("1985-11-17", "2026-11-16"), false);
  assertEquals(birthdayMatches("1992-02-29", "2027-02-28"), true);
  assertEquals(birthdayMatches("1992-02-29", "2028-02-28"), false);
  assertEquals(birthdayMatches("1992-02-29", "2028-02-29"), true);
});

Deno.test("uses Luxembourg local date and hour", () => {
  // 23:30 UTC on 14 Nov is already 15 Nov 00:30 in Luxembourg (UTC+1 in winter)
  assertEquals(luxembourgTodayISO(new Date("2026-11-14T23:30:00Z")), "2026-11-15");
  // 07:00 UTC in winter = 08:00 Luxembourg; in summer = 09:00
  assertEquals(luxembourgHour(new Date("2026-11-14T07:00:00Z")), 8);
  assertEquals(luxembourgHour(new Date("2026-07-14T07:00:00Z")), 9);
});
