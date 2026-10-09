import { describe, expect, it, vi } from "vitest";
import { createTestContext } from "../../test/test-context";
import { CalDavClient } from "../providers/caldav/caldav-client";
import { GoogleClient, type GoogleEventJson } from "../providers/google/google-client";
import { googleEventId, googleToIcs, icsToGoogle } from "./family-remote-stores";

const CALENDAR_URL = "https://caldav.example/home/menu/";
const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };

/** CalDAV calendar in memory, reached through the resource methods used for family data. */
const fakeCalDav = (caldav: CalDavClient) => {
  const resources = new Map<string, string>();
  vi.spyOn(caldav, "listResources").mockImplementation(async () => [...resources.entries()].map(([href, ics]) => ({ href, ics, etag: null })));
  vi.spyOn(caldav, "getResource").mockImplementation(async (_credentials, href) => (resources.has(href) ? { href, ics: resources.get(href)!, etag: null } : null));
  vi.spyOn(caldav, "putEvent").mockImplementation(async (_credentials, href, ics) => {
    resources.set(href, ics);
  });
  vi.spyOn(caldav, "deleteEvent").mockImplementation(async (_credentials, href) => {
    resources.delete(href);
  });
  vi.spyOn(caldav, "fetchEvents").mockResolvedValue([]);
  vi.spyOn(caldav, "discoverCalendars").mockResolvedValue([{ remoteUrl: CALENDAR_URL, name: "Menu iCloud", color: null }]);
  return resources;
};

const setup = async () => {
  const caldav = new CalDavClient(async () => new Response("", { status: 500 }));
  const resources = fakeCalDav(caldav);
  const ctx = createTestContext(caldav);
  const admin = (await ctx.auth.setup({ householdName: "Casa", username: "mario", displayName: "Mario", password: "very-long-password", color: "#2563EB" })).user;
  const account = await ctx.providers.create({ provider: "icloud", label: "Famiglia", username: "family@icloud.com", password: "abcd-efgh" });
  const calendar = ctx.calendars.add({ accountId: account.id, remoteUrl: CALENDAR_URL, name: "Menu iCloud", color: "#F97316" });
  return { ctx, admin, calendar, resources };
};

describe("Menu and birthdays on a provider calendar", () => {
  it("uses the built-in server until a calendar is marked, then that calendar automatically", async () => {
    const { ctx, calendar } = await setup();
    expect((await ctx.targets.info("menu")).current).toMatchObject({ id: "internal", provider: "internal" });

    ctx.calendars.update(calendar.id, { purpose: "meals" });
    expect((await ctx.targets.info("menu")).current).toMatchObject({ id: calendar.id, provider: "icloud", name: "Menu iCloud" });
    // Explicitly kept on the built-in server.
    ctx.settings.setFamilyTarget("menuCalendarId", "internal");
    expect((await ctx.targets.info("menu")).current.id).toBe("internal");
  });

  it("moves the menu to the provider calendar and back, keeping the dishes", async () => {
    const { ctx, admin, calendar, resources } = await setup();
    await ctx.menu.create({ date: "2026-10-06", slot: "cena", title: "Minestrone", ingredients: ["zucchine", "carote"], note: null });
    await ctx.menu.create({ date: "2026-10-07", slot: "pranzo", title: "Lasagne", ingredients: [], note: "Nonna" });

    const result = await ctx.targets.setTarget("menu", calendar.id, true);
    expect(result).toMatchObject({ moved: 2, failed: 0, target: { current: { id: calendar.id }, leftover: 0 } });
    expect(await ctx.menu.list()).toEqual([]);
    expect(resources.size).toBe(2);
    expect([...resources.values()].join()).toContain("SUMMARY:Cena: Minestrone");
    // The chosen calendar is now the menu calendar.
    expect(ctx.calendarsRepository.findById(calendar.id)!.purpose).toBe("meals");

    const meals = await ctx.targets.mealsBetween("2026-10-01", "2026-10-31");
    expect(meals.map((meal) => [meal.title, meal.slot, meal.ingredients, meal.note])).toEqual([
      ["Minestrone", "cena", ["zucchine", "carote"], null],
      ["Lasagne", "pranzo", [], "Nonna"]
    ]);
    const { calendars } = await ctx.calendars.getCalendars(admin, range);
    // Shown once, as the family menu with the calendar's name.
    expect(calendars.filter((entry) => entry.kind === "meals").map((entry) => [entry.id, entry.name, entry.events.length])).toEqual([["menu", "Menu iCloud", 2]]);

    // New dishes go to the provider calendar.
    await ctx.targets.menuObjects().create({ date: "2026-10-08", slot: "cena", title: "Pizza", ingredients: [], note: null });
    expect(resources.size).toBe(3);

    const back = await ctx.targets.setTarget("menu", "internal", true);
    expect(back).toMatchObject({ moved: 3, failed: 0, target: { current: { id: "internal" } } });
    expect(resources.size).toBe(0);
    expect((await ctx.menu.list()).map((meal) => meal.title).sort()).toEqual(["Lasagne", "Minestrone", "Pizza"]);
  });

  it("shows what is left on the built-in server apart and moves it on request", async () => {
    const { ctx, admin, calendar } = await setup();
    await ctx.occasions.create({ name: "Luca", kind: "birthday", month: 10, day: 20, year: 2017 });
    ctx.calendars.update(calendar.id, { purpose: "birthdays" });

    expect((await ctx.targets.info("occasions")).leftover).toBe(1);
    const { calendars } = await ctx.calendars.getCalendars(admin, range);
    expect(calendars.filter((entry) => entry.kind === "birthdays").map((entry) => entry.id)).toEqual(["occasions-internal"]);

    const result = await ctx.targets.setTarget("occasions", null, true);
    expect(result).toMatchObject({ moved: 1, target: { leftover: 0, current: { id: calendar.id } } });
    expect((await ctx.targets.occasions()).map((occasion) => [occasion.name, occasion.month, occasion.day, occasion.year])).toEqual([["Luca", 10, 20, 2017]]);
  });

  it("refuses calendars that cannot hold family data", async () => {
    const { ctx } = await setup();
    await expect(ctx.targets.setTarget("menu", "nope", false)).rejects.toThrow(/Calendario non valido/);

    // Google's birthdays from the contacts are read-only: never chosen, even when marked.
    const secret = JSON.stringify({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" });
    const account = ctx.accounts.insert({ provider: "google", label: "Google", username: "family@example.com", password: secret, serverUrl: null });
    const contacts = ctx.calendars.add({
      accountId: account.id,
      remoteUrl: "https://www.googleapis.com/calendar/v3/calendars/addressbook%23contacts%40group.v.calendar.google.com",
      name: "Compleanni",
      color: "#DB2777"
    });
    ctx.calendars.update(contacts.id, { purpose: "birthdays" });
    expect((await ctx.targets.info("occasions")).current.id).toBe("internal");
    expect((await ctx.targets.info("occasions")).options.map((option) => option.id)).not.toContain(contacts.id);
  });
});

describe("Google calendar mapping", () => {
  it("keeps summary, dates, yearly rule and Familywall properties both ways", () => {
    const id = "6f1c2a3e-1111-4a2b-9c3d-000000000001";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${id}`,
      "SUMMARY:🎂 Luca",
      "DTSTART;VALUE=DATE:20171020",
      "DTEND;VALUE=DATE:20171021",
      "RRULE:FREQ=YEARLY",
      "TRANSP:TRANSPARENT",
      "X-FAMILYWALL-KIND:birthday",
      "X-FAMILYWALL-YEAR:2017",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    const event = icsToGoogle(id, ics);
    expect(event).toMatchObject({
      id: googleEventId(id),
      summary: "🎂 Luca",
      start: { date: "2017-10-20" },
      end: { date: "2017-10-21" },
      recurrence: ["RRULE:FREQ=YEARLY"],
      transparency: "transparent",
      extendedProperties: { private: { "X-FAMILYWALL-KIND": "birthday", "X-FAMILYWALL-YEAR": "2017" } }
    });
    expect(event.id).toMatch(/^[a-v0-9]+$/);

    const back = googleToIcs(event as GoogleEventJson)!;
    expect(back).toContain("SUMMARY:🎂 Luca");
    expect(back).toContain("DTSTART;VALUE=DATE:20171020");
    expect(back).toContain("RRULE:FREQ=YEARLY");
    expect(back).toContain("X-FAMILYWALL-YEAR:2017");
  });

  it("writes and reads birthdays on a Google calendar", async () => {
    const google = new GoogleClient(async () => new Response("", { status: 500 }));
    const events = new Map<string, GoogleEventJson>();
    vi.spyOn(google, "listEventsRaw").mockImplementation(async () => [...events.values()]);
    vi.spyOn(google, "getEventRaw").mockImplementation(async (_secret, _url, id) => events.get(id) ?? null);
    vi.spyOn(google, "putEventRaw").mockImplementation(async (_secret, _url, event) => {
      events.set(event.id, event);
    });
    vi.spyOn(google, "deleteEventRaw").mockImplementation(async (_secret, _url, id) => {
      events.delete(id);
    });
    const ctx = createTestContext(undefined, undefined, google);
    const secret = JSON.stringify({ clientId: "id", clientSecret: "secret", refreshToken: "refresh" });
    const account = ctx.accounts.insert({ provider: "google", label: "Google", username: "family@example.com", password: secret, serverUrl: null });
    const calendar = ctx.calendars.add({ accountId: account.id, remoteUrl: "https://www.googleapis.com/calendar/v3/calendars/family", name: "Compleanni Google", color: "#DB2777" });

    await ctx.targets.setTarget("occasions", calendar.id, false);
    const created = await ctx.targets.occasionObjects().create({ name: "Sofia", kind: "birthday", month: 2, day: 29, year: 2016 });
    expect(events.size).toBe(1);
    expect(await ctx.targets.occasions()).toMatchObject([{ name: "Sofia", month: 2, day: 29, year: 2016 }]);

    await ctx.targets.occasionObjects().update(created.id, { name: "Sofia B.", kind: "birthday", month: 2, day: 29, year: 2016 });
    expect([...events.values()][0]!.summary).toBe("🎂 Sofia B.");
    await ctx.targets.occasionObjects().delete(created.id);
    expect(events.size).toBe(0);
  });
});
