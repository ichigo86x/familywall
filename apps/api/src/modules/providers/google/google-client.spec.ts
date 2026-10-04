import { describe, expect, it } from "vitest";
import { createTestContext } from "../../../test/test-context";
import { GoogleClient, googleCalendarUrl, type GoogleSecret } from "./google-client";

const NOW = Date.parse("2026-10-07T10:00:00Z");
const secret: GoogleSecret = { clientId: "client-123.apps.googleusercontent.com", clientSecret: "shh", refreshToken: "refresh-1" };
const CAL = googleCalendarUrl("family@group.calendar.google.com");

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  body: unknown;
}

/** Fake Google token endpoint + REST API; `routes` answers "METHOD path" keys. */
const fakeGoogle = (routes: Record<string, (call: Call) => Response>) => {
  const calls: Call[] = [];
  const fetchImpl = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    if (url.href === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(String(init.body));
      calls.push({ method, url: "token", body: Object.fromEntries(form) });
      const idToken = `x.${Buffer.from(JSON.stringify({ email: "famiglia@gmail.com" })).toString("base64url")}.y`;
      return json({ access_token: "access-1", expires_in: 3600, refresh_token: form.get("grant_type") === "authorization_code" ? "refresh-new" : undefined, id_token: idToken });
    }
    const call = { method, url: decodeURIComponent(url.pathname) + url.search, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer access-1");
    const key = `${method} ${decodeURIComponent(url.pathname)}`;
    const handler = routes[key];
    return handler ? handler(call) : json({ error: { message: `no route ${key}` } }, 404);
  };
  return { fetchImpl, calls };
};

describe("GoogleClient calendar", () => {
  it("maps single, all-day and recurring instances", async () => {
    const fake = fakeGoogle({
      "GET /calendar/v3/calendars/family@group.calendar.google.com/events": () =>
        json({
          items: [
            { id: "e1", summary: "Dentista Luca", start: { dateTime: "2026-10-08T09:00:00+02:00" }, end: { dateTime: "2026-10-08T10:00:00+02:00" } },
            { id: "e2", summary: "Gita", start: { date: "2026-10-10" }, end: { date: "2026-10-11" } },
            { id: "k1_20261012T150000Z", recurringEventId: "k1", summary: "Karate", start: { dateTime: "2026-10-12T17:00:00+02:00" }, end: { dateTime: "2026-10-12T18:00:00+02:00" } },
            { id: "gone", status: "cancelled" }
          ]
        })
    });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    const events = await client.fetchEvents(secret, CAL, new Date("2026-10-05T00:00:00Z"), new Date("2026-10-19T00:00:00Z"));

    expect(events).toEqual([
      { uid: "e1", occurrenceKey: "", title: "Dentista Luca", startAt: "2026-10-08T07:00:00.000Z", endAt: "2026-10-08T08:00:00.000Z", allDay: false },
      { uid: "e2", occurrenceKey: "", title: "Gita", startAt: "2026-10-10T00:00:00.000Z", endAt: "2026-10-11T00:00:00.000Z", allDay: true },
      { uid: "k1", occurrenceKey: "k1_20261012T150000Z", title: "Karate", startAt: "2026-10-12T15:00:00.000Z", endAt: "2026-10-12T16:00:00.000Z", allDay: false }
    ]);
    expect(fake.calls[1]!.url).toContain("singleEvents=true");
  });

  it("creates recurring events with the household time zone", async () => {
    const fake = fakeGoogle({ "POST /calendar/v3/calendars/family@group.calendar.google.com/events": () => json({ id: "new1" }) });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    const id = await client.createEvent(secret, CAL, {
      title: "Piscina",
      times: { startAt: "2026-10-05T15:00:00.000Z", endAt: "2026-10-05T16:00:00.000Z", allDay: false },
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      timeZone: "Europe/Rome"
    });

    expect(id).toBe("new1");
    expect(fake.calls.at(-1)!.body).toEqual({
      summary: "Piscina",
      start: { dateTime: "2026-10-05T15:00:00.000Z", timeZone: "Europe/Rome" },
      end: { dateTime: "2026-10-05T16:00:00.000Z", timeZone: "Europe/Rome" },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO"]
    });
  });

  it("moves a whole series by the offset of the edited occurrence", async () => {
    const base = "/calendar/v3/calendars/family@group.calendar.google.com/events";
    const fake = fakeGoogle({
      [`GET ${base}/k1_20261012T150000Z`]: () => json({ id: "k1_20261012T150000Z", start: { dateTime: "2026-10-12T15:00:00Z" } }),
      [`GET ${base}/k1`]: () => json({ id: "k1", start: { dateTime: "2026-09-07T15:00:00Z", timeZone: "Europe/Rome" } }),
      [`PATCH ${base}/k1`]: () => json({ id: "k1" })
    });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    await client.updateEvent(
      secret,
      CAL,
      { uid: "k1", occurrenceKey: "k1_20261012T150000Z" },
      "series",
      { startAt: "2026-10-12T16:00:00.000Z", endAt: "2026-10-12T17:30:00.000Z", allDay: false },
      "Europe/Rome"
    );

    expect(fake.calls.at(-1)).toMatchObject({
      method: "PATCH",
      body: { start: { dateTime: "2026-09-07T16:00:00.000Z", timeZone: "Europe/Rome" }, end: { dateTime: "2026-09-07T17:30:00.000Z", timeZone: "Europe/Rome" } }
    });
  });

  it("deletes only the chosen occurrence", async () => {
    const base = "/calendar/v3/calendars/family@group.calendar.google.com/events";
    const fake = fakeGoogle({ [`DELETE ${base}/k1_20261012T150000Z`]: () => new Response(null, { status: 204 }) });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    await client.deleteEvent(secret, CAL, { uid: "k1", occurrenceKey: "k1_20261012T150000Z" }, "occurrence");

    expect(fake.calls.at(-1)).toMatchObject({ method: "DELETE", url: `${base}/k1_20261012T150000Z` });
  });
});

describe("GoogleClient tasks", () => {
  it("returns open tasks and the ones completed in the last two days", async () => {
    const fake = fakeGoogle({
      "GET /tasks/v1/lists/spesa/tasks": () =>
        json({
          items: [
            { id: "t1", title: "Latte", status: "needsAction" },
            { id: "t2", title: "Pane", status: "completed", completed: "2026-10-06T18:00:00Z" },
            { id: "t3", title: "Uova", status: "completed", completed: "2026-09-01T18:00:00Z" },
            { id: "t4", title: "", status: "needsAction" }
          ]
        })
    });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    const tasks = await client.listTasks(secret, "spesa");

    expect(tasks.map((task) => [task.title, task.completed])).toEqual([
      ["Latte", false],
      ["Pane", true]
    ]);
  });

  it("reopens a task clearing its completion date", async () => {
    const fake = fakeGoogle({ "PATCH /tasks/v1/lists/spesa/tasks/t2": () => json({ id: "t2" }) });
    const client = new GoogleClient(fake.fetchImpl, 5000, () => NOW);

    await client.updateTask(secret, "spesa", "t2", { completed: false });

    expect(fake.calls.at(-1)!.body).toEqual({ status: "needsAction", completed: null });
  });
});

describe("Google OAuth through ProvidersService", () => {
  it("links an account from the pasted redirect address", async () => {
    const fake = fakeGoogle({ "GET /calendar/v3/users/me/calendarList": () => json({ items: [{ id: "primary", summary: "Famiglia", accessRole: "owner" }] }) });
    const ctx = createTestContext(undefined, undefined, new GoogleClient(fake.fetchImpl, 5000, () => NOW));

    const { state, authUrl } = ctx.providers.startGoogleAuth({ label: "Google famiglia", clientId: secret.clientId, clientSecret: "shh", redirectUri: "http://127.0.0.1" });
    expect(new URL(authUrl).searchParams.get("access_type")).toBe("offline");

    const account = await ctx.providers.completeGoogleAuth({ state, redirectedUrl: `http://127.0.0.1/?state=${state}&code=abc&scope=x` });

    expect(account).toMatchObject({ provider: "google", label: "Google famiglia", username: "famiglia@gmail.com" });
    expect(JSON.stringify(ctx.providers.list())).not.toContain("refresh-new");
    expect(fake.calls[0]).toMatchObject({ url: "token", body: { grant_type: "authorization_code", code: "abc", redirect_uri: "http://127.0.0.1" } });
  });

  it("rejects an unknown state", async () => {
    const ctx = createTestContext();
    await expect(ctx.providers.completeGoogleAuth({ state: "forged-state", redirectedUrl: "http://127.0.0.1/?state=forged-state&code=abc" })).rejects.toThrow(
      /scaduto o non riconosciuto/
    );
  });
});
