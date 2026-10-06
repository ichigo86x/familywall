import { describe, expect, it, vi } from "vitest";
import { CalDavClient, CalDavError, ICLOUD_CALDAV_URL, eventResourceUrl } from "./caldav-client";

const credentials = { serverUrl: ICLOUD_CALDAV_URL, username: "family@icloud.com", password: "abcd-efgh-ijkl-mnop" };

const multistatus = (body: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/">${body}</d:multistatus>`, {
    status: 207
  });

describe("CalDavClient", () => {
  it("discovers event calendars through principal and home, skipping task lists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(multistatus(`<d:response><d:propstat><d:prop><d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal></d:prop></d:propstat></d:response>`))
      .mockResolvedValueOnce(multistatus(`<d:response><d:propstat><d:prop><c:calendar-home-set><d:href>https://p01-caldav.icloud.com/123/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response>`))
      .mockResolvedValueOnce(
        multistatus(`
          <d:response><d:href>/123/calendars/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
          <d:response><d:href>/123/calendars/home/</d:href><d:propstat><d:prop>
            <d:displayname>Famiglia &amp; amici</d:displayname>
            <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
            <c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
            <a:calendar-color>#FF2968FF</a:calendar-color>
          </d:prop></d:propstat></d:response>
          <d:response><d:href>/123/calendars/tasks/</d:href><d:propstat><d:prop>
            <d:displayname>Promemoria</d:displayname>
            <d:resourcetype><d:collection/><c:calendar/></d:resourcetype>
            <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
          </d:prop></d:propstat></d:response>`)
      );

    const calendars = await new CalDavClient(fetchMock).discoverCalendars(credentials);

    expect(calendars).toEqual([
      { remoteUrl: "https://p01-caldav.icloud.com/123/calendars/home/", name: "Famiglia & amici", color: "#FF2968" }
    ]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://caldav.icloud.com/",
      "https://caldav.icloud.com/123/principal/",
      "https://p01-caldav.icloud.com/123/calendars/"
    ]);
    expect(fetchMock.mock.calls[0]![1].headers.Authorization).toBe(`Basic ${Buffer.from("family@icloud.com:abcd-efgh-ijkl-mnop").toString("base64")}`);
  });

  it("reports rejected credentials as an auth error", async () => {
    const client = new CalDavClient(vi.fn().mockResolvedValue(new Response("", { status: 401 })));

    await expect(client.discoverCalendars(credentials)).rejects.toMatchObject({ kind: "auth" });
  });

  it("reports network failures without leaking credentials", async () => {
    const client = new CalDavClient(vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    const error = await client.discoverCalendars(credentials).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CalDavError);
    expect((error as CalDavError).kind).toBe("network");
    expect((error as CalDavError).message).not.toContain(credentials.password);
  });

  it("finds an event resource even when the server refuses UID filters (iCloud 412)", async () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc-123\nSUMMARY:Dentista\nEND:VEVENT\nEND:VCALENDAR";
    const calendarUrl = "https://p01-caldav.icloud.com/123/calendars/home/";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === "GET") {
        return new Response("", { status: 404 });
      }
      if (String(init.body).includes("prop-filter")) {
        return new Response("", { status: 412 });
      }
      return multistatus(`<d:response><d:href>/123/calendars/home/other.ics</d:href><d:propstat><d:prop><d:getetag>&quot;9&quot;</d:getetag><c:calendar-data>${ics}</c:calendar-data></d:prop></d:propstat></d:response>`);
    });
    const client = new CalDavClient(fetchImpl);

    expect(await client.findByUid(credentials, calendarUrl, "abc-123")).toEqual({ href: calendarUrl + "other.ics", etag: '"9"', ics });
    expect(await client.findByUid(credentials, calendarUrl, "missing")).toBeNull();
  });

  it("reads the resource named after the uid directly, with its etag", async () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:abc-123\nEND:VEVENT\nEND:VCALENDAR";
    const fetchImpl = vi.fn(async () => new Response(ics, { status: 200, headers: { ETag: '"5"' } }));
    const client = new CalDavClient(fetchImpl);

    expect(await client.findByUid(credentials, "https://cal.example/home/", "abc-123")).toEqual({ href: "https://cal.example/home/abc-123.ics", etag: '"5"', ics });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("parses calendar-data returned by a calendar-query", async () => {
    const ics = "BEGIN:VCALENDAR&#13;\nVERSION:2.0&#13;\nBEGIN:VEVENT&#13;\nUID:a1&#13;\nDTSTART:20261005T070000Z&#13;\nDTEND:20261005T080000Z&#13;\nSUMMARY:Scuola &amp; sport&#13;\nEND:VEVENT&#13;\nEND:VCALENDAR";
    const client = new CalDavClient(
      vi.fn().mockResolvedValue(multistatus(`<d:response><d:href>/123/calendars/home/a1.ics</d:href><d:propstat><d:prop><d:getetag>"1"</d:getetag><c:calendar-data>${ics}</c:calendar-data></d:prop></d:propstat></d:response>`))
    );

    const events = await client.fetchEvents(credentials, "https://p01-caldav.icloud.com/123/calendars/home/", new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));

    expect(events).toEqual([
      { uid: "a1", occurrenceKey: "", title: "Scuola & sport", startAt: "2026-10-05T07:00:00.000Z", endAt: "2026-10-05T08:00:00.000Z", allDay: false }
    ]);
  });
});

describe("eventResourceUrl", () => {
  it("gives every event its own resource name", () => {
    const first = eventResourceUrl("https://cal.example/home/fam/", "2f1c9a3e-1111-4a2b-9c3d-aaaaaaaaaaaa@familywall");
    const second = eventResourceUrl("https://cal.example/home/fam", "7b8d0e4f-2222-4c5d-8e6f-bbbbbbbbbbbb@familywall");

    expect(first).toBe("https://cal.example/home/fam/2f1c9a3e-1111-4a2b-9c3d-aaaaaaaaaaaa%40familywall.ics");
    expect(second).not.toBe(first);
  });
});
