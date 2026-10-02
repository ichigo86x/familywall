import { describe, expect, it, vi } from "vitest";
import { CalDavClient, CalDavError, ICLOUD_CALDAV_URL } from "./caldav-client";

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
