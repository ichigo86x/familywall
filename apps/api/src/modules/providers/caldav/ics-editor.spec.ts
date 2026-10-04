import { describe, expect, it } from "vitest";
import { applyEventDelete, applyEventEdit, buildEventIcs } from "./ics-editor";
import { parseCalendarData } from "./ics-parser";

const ROME_TZ = `BEGIN:VTIMEZONE
TZID:Europe/Rome
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const WEEKLY = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
${ROME_TZ}
BEGIN:VEVENT
UID:karate
DTSTAMP:20260801T000000Z
DTSTART;TZID=Europe/Rome:20261006T170000
DTEND;TZID=Europe/Rome:20261006T180000
RRULE:FREQ=WEEKLY;BYDAY=TU
SUMMARY:Karate
LOCATION:Palestra
END:VEVENT
END:VCALENDAR`;

const SINGLE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
${ROME_TZ}
BEGIN:VEVENT
UID:dentist
DTSTAMP:20260801T000000Z
DTSTART;TZID=Europe/Rome:20261005T090000
DURATION:PT1H
SUMMARY:Dentista
END:VEVENT
END:VCALENDAR`;

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-11-01T00:00:00Z");
const read = (ics: string) => parseCalendarData(ics, from, to).map((event) => [event.startAt, event.endAt, event.title]);

// 13 Oct 17:00 Rome (CEST) = 15:00 UTC
const SECOND_OCCURRENCE = "2026-10-13T15:00:00.000Z";

describe("buildEventIcs", () => {
  it("creates a parseable event", () => {
    const ics = buildEventIcs("new@familywall", "Cena", { startAt: "2026-10-07T18:00:00.000Z", endAt: "2026-10-07T20:00:00.000Z", allDay: false });

    expect(ics).toContain("UID:new@familywall");
    expect(read(ics)).toEqual([["2026-10-07T18:00:00.000Z", "2026-10-07T20:00:00.000Z", "Cena"]]);
  });

  it("writes all-day events as DATE values", () => {
    const ics = buildEventIcs("bday@familywall", "Compleanno", { startAt: "2026-10-15T00:00:00.000Z", endAt: "2026-10-16T00:00:00.000Z", allDay: true });

    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(parseCalendarData(ics, from, to)[0]).toMatchObject({ allDay: true, startAt: "2026-10-15T00:00:00.000Z" });
  });
});

describe("buildEventIcs with recurrence", () => {
  const weekly = { frequency: "weekly" as const, interval: 1, weekdays: [] };

  it("keeps the local time across the daylight saving change", () => {
    // Monday 19 Oct 2026 18:00 Rome (CEST = UTC+2); summer time ends on 25 Oct.
    const ics = buildEventIcs(
      "karate@familywall",
      "Karate",
      { startAt: "2026-10-19T16:00:00.000Z", endAt: "2026-10-19T17:00:00.000Z", allDay: false },
      { rule: { ...weekly, count: 3 }, timeZone: "Europe/Rome" }
    );

    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261019T180000");
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=3");
    const starts = parseCalendarData(ics, new Date("2026-10-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z")).map((event) => event.startAt);
    // 18:00 local every week: 16:00Z in summer time, 17:00Z after the change.
    expect(starts).toEqual(["2026-10-19T16:00:00.000Z", "2026-10-26T17:00:00.000Z", "2026-11-02T17:00:00.000Z"]);
  });

  it("writes weekdays, interval and an inclusive end day", () => {
    const ics = buildEventIcs(
      "swim@familywall",
      "Piscina",
      { startAt: "2026-10-05T15:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z", allDay: false },
      { rule: { ...weekly, interval: 2, weekdays: ["MO", "TH"], until: "2026-10-22" }, timeZone: "Europe/Rome" }
    );

    const starts = read(ics).map(([start]) => start);
    expect(starts).toEqual(["2026-10-05T15:00:00.000Z", "2026-10-08T15:00:00.000Z", "2026-10-19T15:00:00.000Z", "2026-10-22T15:00:00.000Z"]);
  });

  it("repeats all-day events by date", () => {
    const ics = buildEventIcs(
      "bday@familywall",
      "Compleanno Sofia",
      { startAt: "2026-10-15T00:00:00.000Z", endAt: "2026-10-16T00:00:00.000Z", allDay: true },
      { rule: { frequency: "yearly", interval: 1, weekdays: [] }, timeZone: "Europe/Rome" }
    );

    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    const starts = parseCalendarData(ics, new Date("2026-01-01T00:00:00Z"), new Date("2029-01-01T00:00:00Z")).map((event) => event.startAt);
    expect(starts).toEqual(["2026-10-15T00:00:00.000Z", "2027-10-15T00:00:00.000Z", "2028-10-15T00:00:00.000Z"]);
  });
});

describe("applyEventEdit", () => {
  it("updates a single event in place, keeping its timezone and replacing DURATION", () => {
    const ics = applyEventEdit(SINGLE, "dentist", "", "series", {
      title: "Dentista (spostato)",
      startAt: "2026-10-05T08:00:00.000Z",
      endAt: "2026-10-05T09:30:00.000Z"
    });

    expect(ics).toContain("DTSTART;TZID=Europe/Rome:20261005T100000");
    expect(ics).not.toContain("DURATION");
    expect(ics).toMatch(/SEQUENCE:1/);
    expect(read(ics)).toEqual([["2026-10-05T08:00:00.000Z", "2026-10-05T09:30:00.000Z", "Dentista (spostato)"]]);
  });

  it("changes one occurrence with an override and leaves the rest of the series", () => {
    const ics = applyEventEdit(WEEKLY, "karate", SECOND_OCCURRENCE, "occurrence", {
      startAt: "2026-10-13T16:00:00.000Z",
      endAt: "2026-10-13T17:00:00.000Z",
      title: "Karate (recupero)"
    });

    expect(ics).toContain("RECURRENCE-ID;TZID=Europe/Rome:20261013T170000");
    expect(read(ics)).toEqual([
      ["2026-10-06T15:00:00.000Z", "2026-10-06T16:00:00.000Z", "Karate"],
      ["2026-10-13T16:00:00.000Z", "2026-10-13T17:00:00.000Z", "Karate (recupero)"],
      ["2026-10-20T15:00:00.000Z", "2026-10-20T16:00:00.000Z", "Karate"],
      ["2026-10-27T16:00:00.000Z", "2026-10-27T17:00:00.000Z", "Karate"]
    ]);
  });

  it("updates an existing override instead of adding a second one", () => {
    const once = applyEventEdit(WEEKLY, "karate", SECOND_OCCURRENCE, "occurrence", { title: "Primo cambio" });
    const twice = applyEventEdit(once, "karate", SECOND_OCCURRENCE, "occurrence", { title: "Secondo cambio" });

    expect(twice.match(/RECURRENCE-ID/g)).toHaveLength(1);
    expect(read(twice)[1]?.[2]).toBe("Secondo cambio");
  });

  it("shifts the whole series when an occurrence moves with scope series", () => {
    const ics = applyEventEdit(WEEKLY, "karate", SECOND_OCCURRENCE, "series", {
      startAt: "2026-10-13T15:30:00.000Z",
      endAt: "2026-10-13T16:30:00.000Z"
    });

    expect(read(ics).map(([start]) => start)).toEqual([
      "2026-10-06T15:30:00.000Z",
      "2026-10-13T15:30:00.000Z",
      "2026-10-20T15:30:00.000Z",
      "2026-10-27T16:30:00.000Z"
    ]);
  });

  it("renames the series without moving it", () => {
    const ics = applyEventEdit(WEEKLY, "karate", SECOND_OCCURRENCE, "series", { title: "Judo" });

    expect(read(ics).map(([start, , title]) => [start, title])).toEqual([
      ["2026-10-06T15:00:00.000Z", "Judo"],
      ["2026-10-13T15:00:00.000Z", "Judo"],
      ["2026-10-20T15:00:00.000Z", "Judo"],
      ["2026-10-27T16:00:00.000Z", "Judo"]
    ]);
  });
});

describe("applyEventDelete", () => {
  it("excludes a single occurrence with EXDATE and drops its override", () => {
    const withOverride = applyEventEdit(WEEKLY, "karate", SECOND_OCCURRENCE, "occurrence", { title: "Spostato" });
    const ics = applyEventDelete(withOverride, "karate", SECOND_OCCURRENCE, "occurrence");

    expect(ics).not.toBeNull();
    expect(ics).toContain("EXDATE;TZID=Europe/Rome:20261013T170000");
    expect(ics).not.toContain("RECURRENCE-ID");
    expect(read(ics!).map(([start]) => start)).toEqual(["2026-10-06T15:00:00.000Z", "2026-10-20T15:00:00.000Z", "2026-10-27T16:00:00.000Z"]);
  });

  it("asks to delete the resource for whole series and single events", () => {
    expect(applyEventDelete(WEEKLY, "karate", SECOND_OCCURRENCE, "series")).toBeNull();
    expect(applyEventDelete(SINGLE, "dentist", "", "occurrence")).toBeNull();
  });
});
