import { describe, expect, it, vi } from "vitest";
import type { User } from "@familywall/shared";
import { CalDavClient, CalDavError } from "../providers/caldav/caldav-client";
import { parseCalendarData } from "../providers/caldav/ics-parser";
import { createTestContext } from "../../test/test-context";
import { projectEventForViewer } from "./event-visibility";

const SCHOOL_TRIP = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:school-trip
DTSTART:20261005T070000Z
DTEND:20261005T150000Z
SUMMARY:Gita scolastica
END:VEVENT
END:VCALENDAR`;

const WEEKLY_SWIM = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:swim
DTSTART:20261007T150000Z
DTEND:20261007T160000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Piscina
END:VEVENT
END:VCALENDAR`;

const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };
const CALENDAR_URL = "https://caldav.example/home/";

/** In-memory CalDAV collection: resources keyed by href with etags that change on every write. */
const fakeServer = (caldav: CalDavClient, initial: Record<string, string>) => {
  const resources = new Map(Object.entries(initial).map(([name, ics]) => [CALENDAR_URL + name, { ics, etag: '"1"' }]));
  let version = 1;
  const uidOf = (ics: string) => /UID:(.+)/.exec(ics)?.[1]?.trim();

  vi.spyOn(caldav, "discoverCalendars").mockResolvedValue([{ remoteUrl: CALENDAR_URL, name: "Home", color: null }]);
  vi.spyOn(caldav, "fetchEvents").mockImplementation(async (_credentials, _url, from, to) =>
    [...resources.values()].flatMap((resource) => parseCalendarData(resource.ics, from, to))
  );
  vi.spyOn(caldav, "findByUid").mockImplementation(async (_credentials, _url, uid) => {
    const entry = [...resources.entries()].find(([, resource]) => uidOf(resource.ics) === uid);
    return entry ? { href: entry[0], etag: entry[1].etag, ics: entry[1].ics } : null;
  });
  vi.spyOn(caldav, "putEvent").mockImplementation(async (_credentials, href, ics, options) => {
    const current = resources.get(href);
    if ((options.create && current) || (options.etag && current?.etag !== options.etag)) {
      throw new CalDavError("conflict", "L'evento è stato modificato altrove nel frattempo. Ricarica e riprova.");
    }
    version += 1;
    resources.set(href, { ics, etag: `"${version}"` });
  });
  vi.spyOn(caldav, "deleteEvent").mockImplementation(async (_credentials, href) => {
    resources.delete(href);
  });
  return resources;
};

const setup = async (initial: Record<string, string> = {}) => {
  const caldav = new CalDavClient(async () => new Response("", { status: 207 }));
  const server = fakeServer(caldav, initial);
  const ctx = createTestContext(caldav);
  const admin = (
    await ctx.auth.setup({ householdName: "Casa", username: "mario", displayName: "Mario", password: "very-long-password", color: "#2563EB" })
  ).user;
  const child = await ctx.members.create({ username: "luca", displayName: "Luca", role: "Child", color: "#14B8A6", password: "password1" });
  const account = await ctx.providers.create({ provider: "icloud", label: "Famiglia", username: "family@icloud.com", password: "abcd-efgh" });
  const calendar = ctx.calendars.add({ accountId: account.id, remoteUrl: CALENDAR_URL, name: "Famiglia", color: "#3A7D6E" });
  const events = async () => (await ctx.calendars.getCalendars(admin, range)).calendars[0]!.events;
  return { ctx, caldav, admin, child, calendar, server, events };
};

describe("CalendarsService and EventsService", () => {
  it("stores provider passwords encrypted and never returns them", async () => {
    const { ctx } = await setup();
    const row = ctx.db.prepare("SELECT secret_enc FROM provider_accounts").get() as { secret_enc: string };

    expect(row.secret_enc).not.toContain("abcd-efgh");
    expect(JSON.stringify(ctx.providers.list())).not.toContain("abcd");
  });

  it("creates events on the provider and keeps app metadata locally", async () => {
    const { ctx, admin, child, calendar, server, events } = await setup({ "trip.ics": SCHOOL_TRIP });

    const created = await ctx.events.create(admin, {
      calendarId: calendar.id,
      title: "Karate",
      startAt: "2026-10-06T16:00:00.000Z",
      endAt: "2026-10-06T17:00:00.000Z",
      allDay: false,
      memberIds: [child.id],
      tagMemberId: null,
      privacy: "private",
      recurrence: null
    });

    expect(created).toMatchObject({ source: "remote", recurring: false, privacy: "private" });
    expect([...server.values()].some((resource) => resource.ics.includes("SUMMARY:Karate"))).toBe(true);
    expect((await events()).map((event) => [event.title, event.memberIds, event.privacy])).toEqual([
      ["Gita scolastica", [], "shared"],
      ["Karate", [child.id], "private"]
    ]);
  });

  it("edits single provider events and their metadata", async () => {
    const { ctx, admin, child, server, events } = await setup({ "trip.ics": SCHOOL_TRIP });
    const [trip] = await events();

    await ctx.events.update(admin, trip!.id, { title: "Gita al museo", endAt: "2026-10-05T16:00:00.000Z", memberIds: [child.id] });

    expect(server.get(CALENDAR_URL + "trip.ics")!.ics).toContain("SUMMARY:Gita al museo");
    expect((await events())[0]).toMatchObject({ title: "Gita al museo", endAt: "2026-10-05T16:00:00.000Z", memberIds: [child.id] });
  });

  it("requires a scope for recurring occurrences and applies it", async () => {
    const { ctx, admin, child, events } = await setup({ "swim.ics": WEEKLY_SWIM });
    const [first, second] = await events();
    expect(second).toMatchObject({ recurring: true });

    await expect(ctx.events.update(admin, second!.id, { title: "X" })).rejects.toThrow(/questa occorrenza o per tutta la serie/);

    await ctx.events.update(admin, second!.id, { scope: "occurrence", title: "Piscina (gara)", memberIds: [child.id] });
    let current = await events();
    expect(current.map((event) => [event.title, event.memberIds])).toEqual([
      ["Piscina", []],
      ["Piscina (gara)", [child.id]],
      ["Piscina", []]
    ]);

    await ctx.events.update(admin, first!.id, { scope: "series", privacy: "wall-hidden" });
    current = await events();
    expect(current.map((event) => event.privacy)).toEqual(["wall-hidden", "shared", "wall-hidden"]);
  });

  it("lets wall panels in write mode change shared events only", async () => {
    const { ctx, admin, events } = await setup({ "trip.ics": SCHOOL_TRIP });
    const panel = { ...admin, id: "panel", role: "Kiosk" as const, panelWrite: true };
    const [trip] = await events();

    await ctx.events.update(panel, trip!.id, { title: "Gita al lago" });
    await expect(ctx.events.update(panel, trip!.id, { privacy: "private" })).rejects.toThrow(/solo eventi condivisi/);

    await ctx.events.update(admin, trip!.id, { privacy: "private" });
    await expect(ctx.events.update(panel, trip!.id, { title: "X" })).rejects.toThrow(/app dei genitori/);
    await expect(ctx.events.delete(panel, trip!.id)).rejects.toThrow(/app dei genitori/);
  });

  it("deletes one occurrence or the whole series", async () => {
    const { ctx, admin, server, events } = await setup({ "swim.ics": WEEKLY_SWIM });
    const [, second] = await events();

    await ctx.events.delete(admin, second!.id, "occurrence");
    const remaining = await events();
    expect(remaining).toHaveLength(2);

    await ctx.events.delete(admin, remaining[0]!.id, "series");
    expect(await events()).toEqual([]);
    expect(server.size).toBe(0);
  });

  it("colours provider events by the member names in their title unless members were assigned", async () => {
    const { ctx, admin, child, events } = await setup({ "trip.ics": SCHOOL_TRIP.replace("Gita scolastica", "Gita scolastica Luca e Mario") });

    const [trip] = await events();
    expect(trip).toMatchObject({ memberIds: [child.id, admin.id], membersInferred: true });

    await ctx.events.update(admin, trip!.id, { memberIds: [admin.id] });
    expect((await events())[0]).toMatchObject({ memberIds: [admin.id], membersInferred: false });
  });

  it("reports provider failures per calendar instead of failing the request", async () => {
    const { ctx, caldav, admin } = await setup();
    vi.mocked(caldav.fetchEvents).mockRejectedValue(new Error("The server rejected the credentials."));

    const result = await ctx.calendars.getCalendars(admin, range);

    expect(result.calendars[0]).toMatchObject({ events: [], lastError: "The server rejected the credentials." });
    expect(ctx.calendars.listConfigs()[0]!.lastError).toBe("The server rejected the credentials.");
  });

  it("surfaces concurrent provider edits as conflicts", async () => {
    const { ctx, caldav, admin, server, events } = await setup({ "trip.ics": SCHOOL_TRIP });
    const [trip] = await events();
    vi.mocked(caldav.findByUid).mockResolvedValueOnce({ href: CALENDAR_URL + "trip.ics", etag: '"stale"', ics: server.get(CALENDAR_URL + "trip.ics")!.ics });

    await expect(ctx.events.update(admin, trip!.id, { title: "Nuovo" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects events referencing unknown members", async () => {
    const { ctx, admin, calendar } = await setup();

    await expect(
      ctx.events.create(admin, {
        calendarId: calendar.id,
        title: "X",
        startAt: "2026-10-06T16:00:00.000Z",
        endAt: "2026-10-06T17:00:00.000Z",
        allDay: false,
        memberIds: ["ghost"],
        tagMemberId: null,
        privacy: "shared",
        recurrence: null
      })
    ).rejects.toThrow(/membri inesistenti/);
  });
});

describe("projectEventForViewer", () => {
  const viewer = (role: User["role"], id = role.toLowerCase()): User => ({ id, username: id, displayName: id, role, color: "#000000", disabled: false, keywords: [], canLogin: true, panelWrite: false });
  const event = {
    id: "e1",
    calendarId: "c1",
    title: "Visita medica",
    startAt: "2026-10-05T07:00:00.000Z",
    endAt: "2026-10-05T08:00:00.000Z",
    allDay: false,
    memberIds: ["child-in"],
    tagMemberId: "child-in",
    source: "local" as const,
    membersInferred: false,
    recurring: false,
    redacted: false
  };

  it("redacts private events for viewers who are not involved", () => {
    const priv = { ...event, privacy: "private" as const };

    expect(projectEventForViewer(priv, viewer("Parent"))?.title).toBe("Visita medica");
    expect(projectEventForViewer(priv, viewer("Child", "child-in"))?.title).toBe("Visita medica");
    expect(projectEventForViewer(priv, viewer("Child", "child-out"))).toMatchObject({ title: "Occupato", redacted: true, tagMemberId: null });
    expect(projectEventForViewer(priv, viewer("Kiosk"))).toMatchObject({ redacted: true });
  });

  it("hides wall-hidden events from kiosks only", () => {
    const hidden = { ...event, privacy: "wall-hidden" as const };

    expect(projectEventForViewer(hidden, viewer("Kiosk"))).toBeNull();
    expect(projectEventForViewer(hidden, viewer("Child", "child-out"))?.title).toBe("Visita medica");
  });
});
