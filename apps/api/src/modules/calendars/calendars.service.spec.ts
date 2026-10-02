import { describe, expect, it, vi } from "vitest";
import type { User } from "@familywall/shared";
import { CalDavClient } from "../providers/caldav/caldav-client";
import { createTestContext } from "../../test/test-context";
import { projectEventForViewer } from "./event-visibility";

const remoteIcs = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:school-trip
DTSTART:20261005T070000Z
DTEND:20261005T150000Z
SUMMARY:Gita scolastica
END:VEVENT
END:VCALENDAR`;

const range = { from: "2026-10-01T00:00:00.000Z", to: "2026-11-01T00:00:00.000Z" };

const setup = async () => {
  const caldav = new CalDavClient(async () => new Response("", { status: 207 }));
  vi.spyOn(caldav, "discoverCalendars").mockResolvedValue([{ remoteUrl: "https://caldav.example/home/", name: "Home", color: null }]);
  const fetchEvents = vi.spyOn(caldav, "fetchEvents");
  const ctx = createTestContext(caldav);
  const admin = (
    await ctx.auth.setup({ householdName: "Casa", username: "mario", displayName: "Mario", password: "very-long-password", color: "#2563EB" })
  ).user;
  const child = await ctx.members.create({ username: "luca", displayName: "Luca", role: "Child", color: "#14B8A6", password: "password1" });
  const kiosk = await ctx.members.create({ username: "wall", displayName: "Wall", role: "Kiosk", color: "#111111", password: "password1" });
  const account = await ctx.providers.create({ provider: "icloud", label: "Famiglia", username: "family@icloud.com", password: "abcd-efgh" });
  const calendar = ctx.calendars.add({ accountId: account.id, remoteUrl: "https://caldav.example/home/", name: "Famiglia", color: "#3A7D6E" });
  return { ctx, admin, child, kiosk, calendar, fetchEvents };
};

describe("CalendarsService and EventsService", () => {
  it("stores provider passwords encrypted and never returns them", async () => {
    const { ctx } = await setup();
    const row = ctx.db.prepare("SELECT secret_enc FROM provider_accounts").get() as { secret_enc: string };

    expect(row.secret_enc).not.toContain("abcd-efgh");
    expect(JSON.stringify(ctx.providers.list())).not.toContain("abcd");
  });

  it("merges provider events with app metadata and local events", async () => {
    const { ctx, admin, child, calendar, fetchEvents } = await setup();
    fetchEvents.mockImplementation(async () => (await import("../providers/caldav/ics-parser")).parseCalendarData(remoteIcs, new Date(range.from), new Date(range.to)));

    const initial = await ctx.calendars.getCalendars(admin, range);
    const remoteEvent = initial.calendars[0]!.events[0]!;
    expect(remoteEvent).toMatchObject({ title: "Gita scolastica", source: "remote", memberIds: [] });

    ctx.events.update(admin, remoteEvent.id, { memberIds: [child.id], tagMemberId: child.id });
    expect(() => ctx.events.update(admin, remoteEvent.id, { title: "Changed" })).toThrow(/non sono ancora modificabili/);

    ctx.events.create(admin, {
      calendarId: calendar.id,
      title: "Karate",
      startAt: "2026-10-06T16:00:00.000Z",
      endAt: "2026-10-06T17:00:00.000Z",
      allDay: false,
      memberIds: [child.id],
      tagMemberId: null,
      privacy: "shared"
    });

    const events = (await ctx.calendars.getCalendars(admin, range)).calendars[0]!.events;
    expect(events.map((event) => [event.title, event.source, event.memberIds])).toEqual([
      ["Gita scolastica", "remote", [child.id]],
      ["Karate", "local", [child.id]]
    ]);
  });

  it("reports provider failures per calendar instead of failing the request", async () => {
    const { ctx, admin, fetchEvents } = await setup();
    fetchEvents.mockRejectedValue(new Error("The server rejected the credentials."));

    const result = await ctx.calendars.getCalendars(admin, range);

    expect(result.calendars[0]).toMatchObject({ events: [], lastError: "The server rejected the credentials." });
    expect(ctx.calendars.listConfigs()[0]!.lastError).toBe("The server rejected the credentials.");
  });

  it("rejects events referencing unknown members", async () => {
    const { ctx, admin, calendar } = await setup();

    expect(() =>
      ctx.events.create(admin, {
        calendarId: calendar.id,
        title: "X",
        startAt: "2026-10-06T16:00:00.000Z",
        endAt: "2026-10-06T17:00:00.000Z",
        allDay: false,
        memberIds: ["ghost"],
        tagMemberId: null,
        privacy: "shared"
      })
    ).toThrow(/membri inesistenti/);
  });
});

describe("projectEventForViewer", () => {
  const viewer = (role: User["role"], id = role.toLowerCase()): User => ({ id, username: id, displayName: id, role, color: "#000000", disabled: false });
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
