import { describe, expect, it } from "vitest";
import { isoWeek, scheduleEntrySchema, scheduleForDay, type ScheduleEntry } from "@familywall/shared";

const entry = (patch: Partial<ScheduleEntry>): ScheduleEntry => ({
  id: patch.title ?? "x",
  kind: "chore",
  title: "Apparecchiare",
  memberId: "luca",
  person: null,
  weekdays: [],
  weekParity: "all",
  date: null,
  startTime: null,
  endTime: null,
  note: null,
  ...patch
});

describe("scheduleForDay", () => {
  // Monday 5 Oct 2026 is in ISO week 41 (odd); Monday 12 Oct is week 42 (even).
  const monday = new Date(2026, 9, 5);
  const nextMonday = new Date(2026, 9, 12);

  it("matches weekdays, alternating weeks and single dates", () => {
    const entries = [
      entry({ title: "Smart working", kind: "work", memberId: "mario", weekdays: [1, 3] }),
      entry({ title: "Apparecchiare", weekdays: [1], weekParity: "odd" }),
      entry({ title: "Sparecchiare", weekdays: [1], weekParity: "even" }),
      entry({ title: "Pulizie", kind: "presence", memberId: null, person: "Maria", date: "2026-10-12", startTime: "09:00", endTime: "12:00" })
    ];

    expect(isoWeek(monday)).toBe(41);
    expect(scheduleForDay(entries, monday).map((item) => item.title)).toEqual(["Smart working", "Apparecchiare"]);
    expect(scheduleForDay(entries, nextMonday).map((item) => item.title)).toEqual(["Smart working", "Sparecchiare", "Pulizie"]);
    expect(scheduleForDay(entries, new Date(2026, 9, 6))).toEqual([]);
  });

  it("orders work, then chores, then visits", () => {
    const entries = [
      entry({ title: "Pulizie", kind: "presence", memberId: null, person: "Maria", weekdays: [2], startTime: "09:00" }),
      entry({ title: "Sparecchiare", weekdays: [2] }),
      entry({ title: "Ufficio", kind: "work", memberId: "anna", weekdays: [2] })
    ];
    expect(scheduleForDay(entries, new Date(2026, 9, 6)).map((item) => item.kind)).toEqual(["work", "chore", "presence"]);
  });
});

describe("scheduleEntrySchema", () => {
  it("requires a day and someone", () => {
    expect(scheduleEntrySchema.safeParse({ kind: "chore", title: "Apparecchiare", memberId: "luca" }).success).toBe(false);
    expect(scheduleEntrySchema.safeParse({ kind: "presence", title: "Pulizie", weekdays: [2] }).success).toBe(false);
    expect(scheduleEntrySchema.safeParse({ kind: "presence", title: "Pulizie", person: "Maria", weekdays: [2], startTime: "09:00", endTime: "12:00" }).success).toBe(true);
    expect(scheduleEntrySchema.safeParse({ kind: "work", title: "Ufficio", memberId: "anna", weekdays: [1], startTime: "18:00", endTime: "09:00" }).success).toBe(false);
  });
});
