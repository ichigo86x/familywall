import { describe, expect, it } from "vitest";
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

const calendar = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}\r\nEND:VCALENDAR`;

const from = new Date("2026-10-01T00:00:00Z");
const to = new Date("2026-11-01T00:00:00Z");

describe("parseCalendarData", () => {
  it("honours TZID instead of the server timezone", () => {
    const [event] = parseCalendarData(
      calendar(`${ROME_TZ}
BEGIN:VEVENT
UID:dentist
DTSTART;TZID=Europe/Rome:20261005T090000
DTEND;TZID=Europe/Rome:20261005T100000
SUMMARY:Dentista\\, Sofia
END:VEVENT`),
      from,
      to
    );

    expect(event).toMatchObject({
      uid: "dentist",
      title: "Dentista, Sofia",
      startAt: "2026-10-05T07:00:00.000Z",
      endAt: "2026-10-05T08:00:00.000Z",
      allDay: false
    });
  });

  it("expands weekly rules with EXDATE and moved occurrences", () => {
    const events = parseCalendarData(
      calendar(`${ROME_TZ}
BEGIN:VEVENT
UID:karate
DTSTART;TZID=Europe/Rome:20260901T170000
DTEND;TZID=Europe/Rome:20260901T180000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Europe/Rome:20261013T170000
SUMMARY:Karate
END:VEVENT
BEGIN:VEVENT
UID:karate
RECURRENCE-ID;TZID=Europe/Rome:20261020T170000
DTSTART;TZID=Europe/Rome:20261020T180000
DTEND;TZID=Europe/Rome:20261020T190000
SUMMARY:Karate (spostato)
END:VEVENT`),
      from,
      to
    );

    expect(events.map((event) => [event.startAt, event.title])).toEqual([
      ["2026-10-06T15:00:00.000Z", "Karate"],
      ["2026-10-20T16:00:00.000Z", "Karate (spostato)"],
      // 27 Oct is after the switch back to CET (+01:00).
      ["2026-10-27T16:00:00.000Z", "Karate"]
    ]);
    expect(new Set(events.map((event) => event.occurrenceKey)).size).toBe(3);
  });

  it("keeps all-day events on their calendar date with an exclusive end", () => {
    const [birthday] = parseCalendarData(
      calendar(`BEGIN:VEVENT
UID:bday
DTSTART;VALUE=DATE:20261015
SUMMARY:Compleanno Luca
END:VEVENT`),
      from,
      to
    );

    expect(birthday).toMatchObject({
      allDay: true,
      startAt: "2026-10-15T00:00:00.000Z",
      endAt: "2026-10-16T00:00:00.000Z"
    });
  });

  it("drops events outside the range", () => {
    expect(
      parseCalendarData(
        calendar(`BEGIN:VEVENT
UID:old
DTSTART:20250101T100000Z
DTEND:20250101T110000Z
SUMMARY:Old
END:VEVENT`),
        from,
        to
      )
    ).toEqual([]);
  });
});
