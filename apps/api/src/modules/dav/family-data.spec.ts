import { describe, expect, it } from "vitest";
import { scheduleForDay } from "@familywall/shared";
import { nowIso } from "../../database/database";
import { createTestContext } from "../../test/test-context";
import { FAMILY_COLLECTIONS } from "./family-stores";

const icsOf = (ctx: ReturnType<typeof createTestContext>, collection: string, id: string) => ctx.dav.collections.get(collection)?.get(id)?.ics ?? "";

describe("family data on the CalDAV server", () => {
  it("writes birthdays as yearly events and reads them back", async () => {
    const ctx = createTestContext();
    const luca = await ctx.occasions.create({ name: "Luca", kind: "birthday", month: 10, day: 20, year: 2017 });
    await ctx.occasions.create({ name: "Nonni", kind: "anniversary", month: 2, day: 29, year: null });

    const ics = icsOf(ctx, FAMILY_COLLECTIONS.occasions.name, luca.id);
    expect(ics).toContain("SUMMARY:🎂 Luca");
    expect(ics).toContain("DTSTART;VALUE=DATE:20171020");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(await ctx.occasions.list()).toEqual([
      { id: expect.any(String), name: "Nonni", kind: "anniversary", month: 2, day: 29, year: null },
      { id: luca.id, name: "Luca", kind: "birthday", month: 10, day: 20, year: 2017 }
    ]);
  });

  it("reads birthdays added on a phone", async () => {
    const ctx = createTestContext();
    await ctx.dav.put(
      FAMILY_COLLECTIONS.occasions,
      "ABC-123",
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ABC-123\r\nSUMMARY:Sofia\r\nDTSTART;VALUE=DATE:20150305\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    );
    expect(await ctx.occasions.list()).toEqual([{ id: "ABC-123", name: "Sofia", kind: "birthday", month: 3, day: 5, year: 2015 }]);
  });

  it("keeps the menu with ingredients and note in the description", async () => {
    const ctx = createTestContext();
    const meal = await ctx.menu.create({ date: "2026-10-06", slot: "cena", title: "Minestrone", ingredients: ["zucchine", "carote"], note: "senza sale" });
    const ics = icsOf(ctx, FAMILY_COLLECTIONS.menu.name, meal.id);
    expect(ics).toContain("SUMMARY:Cena: Minestrone");
    expect(ics).toContain("DESCRIPTION:zucchine\\ncarote\\n\\nNota: senza sale");

    // A phone renames the dish and changes the slot through the title.
    await ctx.dav.put(FAMILY_COLLECTIONS.menu, meal.id, ics.replace("SUMMARY:Cena: Minestrone", "SUMMARY:Pranzo: Minestra"));
    expect(await ctx.menu.between("2026-10-01", "2026-10-07")).toEqual([
      { id: meal.id, date: "2026-10-06", slot: "pranzo", title: "Minestra", ingredients: ["zucchine", "carote"], note: "senza sale" }
    ]);
    expect(await ctx.menu.between("2026-10-07", "2026-10-08")).toEqual([]);
  });

  it("writes shifts as weekly events, every other week when alternating", async () => {
    const ctx = createTestContext();
    const mario = await ctx.members.create({ username: "mario", displayName: "Mario", role: "Parent", color: "#2563EB", password: "password123" });
    const fields = {
      kind: "chore" as const,
      title: "Apparecchiare",
      memberId: mario.id,
      person: null,
      weekdays: [1, 3],
      weekParity: "even" as const,
      date: null,
      startTime: "19:00",
      endTime: "19:30",
      note: null
    };
    const entry = await ctx.schedule.create(fields, { now: new Date(2026, 9, 7) });
    const ics = icsOf(ctx, FAMILY_COLLECTIONS.schedule.name, entry.id);
    expect(ics).toContain("SUMMARY:Mario: Apparecchiare");
    // 7 Oct 2026 is in ISO week 41 (odd): the series starts on Monday of week 42.
    expect(ics).toContain("DTSTART:20261012T190000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");

    const [read] = await ctx.schedule.list();
    expect(read).toEqual({ ...fields, id: entry.id, done: [] });
    expect((await ctx.schedule.setDone(entry.id, "2026-10-12", true)).done).toEqual(["2026-10-12"]);
    expect((await ctx.schedule.setDone(entry.id, "2026-10-12", false)).done).toEqual([]);
    expect(scheduleForDay([read!], new Date(2026, 9, 12))).toHaveLength(1);
    expect(scheduleForDay([read!], new Date(2026, 9, 5))).toHaveLength(0);

    const single = await ctx.schedule.update(entry.id, { ...fields, weekdays: [], weekParity: "all", date: "2026-10-09", startTime: null, endTime: null });
    expect(single).toMatchObject({ date: "2026-10-09", weekdays: [], startTime: null });
    expect(icsOf(ctx, FAMILY_COLLECTIONS.schedule.name, entry.id)).not.toContain("RRULE");
  });

  it("keeps the notes board as journal entries", async () => {
    const ctx = createTestContext();
    const note = await ctx.notes.create({ title: "Wifi", body: "Password\nsul frigo", color: "#FFF4B8", pinned: true, onDashboard: false, createdBy: "m1" });
    expect(icsOf(ctx, FAMILY_COLLECTIONS.notes.name, note.id)).toContain("BEGIN:VJOURNAL");
    const updated = await ctx.notes.update(note.id, { ...note, onDashboard: true });
    expect(updated).toMatchObject({ title: "Wifi", body: "Password\nsul frigo", pinned: true, onDashboard: true, createdBy: "m1" });
    await ctx.notes.delete(note.id);
    expect(await ctx.notes.list()).toEqual([]);
    await expect(ctx.notes.delete(note.id)).rejects.toThrow(/non trovata/);
  });

  it("moves the data of older versions from the database, once", async () => {
    const ctx = createTestContext();
    const now = nowIso();
    ctx.db.prepare("INSERT INTO occasions (id, name, kind, month, day, year, created_at, updated_at) VALUES ('o1', 'Giulio', 'birthday', 5, 4, 2019, ?, ?)").run(now, now);
    ctx.db.prepare("INSERT INTO menu_meals (id, date, slot, title, ingredients, note, created_at, updated_at) VALUES ('d1', '2026-10-08', 'pranzo', 'Pasta', '[\"pasta\"]', NULL, ?, ?)").run(now, now);
    ctx.db
      .prepare("INSERT INTO schedule_entries (id, kind, title, person, weekdays, week_parity, created_at, updated_at) VALUES ('s1', 'presence', 'Pulizie', 'Anna', '[2]', 'all', ?, ?)")
      .run(now, now);
    ctx.db.prepare("INSERT INTO notes (id, title, body, color, pinned, on_dashboard, created_at, updated_at) VALUES ('n1', 'Wifi', 'sul frigo', '#FFFFFF', 1, 1, ?, ?)").run(now, now);
    expect(ctx.migration.pending()).toBe(4);

    expect(await ctx.migration.run()).toEqual({ occasions: 1, menu: 1, schedule: 1, notes: 1 });
    expect(ctx.migration.pending()).toBe(0);
    expect(await ctx.occasions.list()).toEqual([{ id: "o1", name: "Giulio", kind: "birthday", month: 5, day: 4, year: 2019 }]);
    expect(await ctx.menu.between("2026-10-08", "2026-10-08")).toMatchObject([{ id: "d1", title: "Pasta", ingredients: ["pasta"] }]);
    expect(await ctx.schedule.list()).toMatchObject([{ id: "s1", title: "Pulizie", person: "Anna", weekdays: [2] }]);
    expect(await ctx.notes.list()).toMatchObject([{ id: "n1", title: "Wifi", pinned: true, onDashboard: true, updatedAt: `${now.slice(0, 19)}.000Z` }]);
    expect(await ctx.migration.run()).toEqual({ occasions: 0, menu: 0, schedule: 0, notes: 0 });
  });
});
