import { parseCalendarData, type RemoteEvent } from "./ics-parser";

export const ICLOUD_CALDAV_URL = "https://caldav.icloud.com/";

export interface CalDavCredentials {
  /** Server root used for discovery: iCloud root or the user's CalDAV base URL. */
  serverUrl: string;
  username: string;
  password: string;
}

export interface DiscoveredCalendar {
  remoteUrl: string;
  name: string;
  color: string | null;
}

export type CalDavErrorKind = "auth" | "forbidden" | "conflict" | "http" | "network" | "not-found";

export interface CalDavResource {
  /** Absolute URL of the .ics resource. */
  href: string;
  etag: string | null;
  ics: string;
}

export class CalDavError extends Error {
  public constructor(
    public readonly kind: CalDavErrorKind,
    message: string
  ) {
    super(message);
  }
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const PRINCIPAL_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:current-user-principal/><c:calendar-home-set/></d:prop></d:propfind>`;

const CALENDARS_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop>
</d:propfind>`;

export const escapeXmlText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** URL for a new event resource inside a calendar collection. */
export const eventResourceUrl = (calendarUrl: string, uid: string): string =>
  new URL(`${encodeURIComponent(uid.replace(/[^\w@.-]/g, "_"))}.ics`, calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`).toString();

const formatUtc = (value: Date): string => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export const unescapeXml = (value: string): string =>
  value
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#13;/g, "\r")
    .replace(/&amp;/g, "&");

export const tagContent = (xml: string, tagName: string): string | null => {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tagName}>`, "i"));
  return match?.[1]?.trim() ?? null;
};

const hrefInside = (xml: string, tagName: string): string | null => {
  const content = tagContent(xml, tagName);
  return content ? tagContent(content, "href") : null;
};

export const responseBlocks = (xml: string): string[] =>
  xml.match(/<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/gi) ?? [];

/**
 * Minimal CalDAV client (RFC 4791) covering discovery and event reads.
 * Regex-based XML handling is enough for the multistatus shapes iCloud and common servers return.
 */
export class CalDavClient {
  public constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 15_000
  ) {}

  public async discoverCalendars(credentials: CalDavCredentials): Promise<DiscoveredCalendar[]> {
    const homeUrl = await this.discoverHomeUrl(credentials);
    const response = await this.request(credentials, homeUrl, "PROPFIND", "1", CALENDARS_BODY);
    const homePath = new URL(homeUrl).pathname.replace(/\/+$/, "");

    const calendars = responseBlocks(await response.text()).flatMap((block): DiscoveredCalendar[] => {
      const href = tagContent(block, "href");
      const resourceType = tagContent(block, "resourcetype") ?? "";
      if (!href || !/<(?:[\w-]+:)?calendar\b/i.test(resourceType)) {
        return [];
      }

      const remoteUrl = new URL(unescapeXml(href), homeUrl).toString();
      if (new URL(remoteUrl).pathname.replace(/\/+$/, "") === homePath) {
        return [];
      }

      // Skip task-only collections (Reminders) and anything that cannot hold events.
      const components = [...block.matchAll(/<(?:[\w-]+:)?comp\b[^>]*name="([^"]+)"/gi)].map((match) => match[1]!.toUpperCase());
      if (components.length > 0 && !components.includes("VEVENT")) {
        return [];
      }

      const color = tagContent(block, "calendar-color")?.match(/#[0-9a-f]{6}/i)?.[0] ?? null;
      const name = unescapeXml(tagContent(block, "displayname") ?? "") || decodeURIComponent(remoteUrl.split("/").filter(Boolean).pop() ?? "");

      return [{ remoteUrl, name: name || "Calendario", color }];
    });

    return [...new Map(calendars.map((calendar) => [calendar.remoteUrl, calendar])).values()];
  }

  public async fetchEvents(credentials: CalDavCredentials, calendarUrl: string, from: Date, to: Date): Promise<RemoteEvent[]> {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:time-range start="${formatUtc(from)}" end="${formatUtc(to)}"/>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

    const response = await this.request(credentials, calendarUrl, "REPORT", "1", body);
    const xml = await response.text();

    return responseBlocks(xml).flatMap((block) => {
      const data = tagContent(block, "calendar-data");
      return data ? parseCalendarData(unescapeXml(data), from, to) : [];
    });
  }

  /** Looks up the resource holding an event (master and overrides share one resource). */
  public async findByUid(credentials: CalDavCredentials, calendarUrl: string, uid: string): Promise<CalDavResource | null> {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">
    <c:prop-filter name="UID"><c:text-match collation="i;octet">${escapeXmlText(uid)}</c:text-match></c:prop-filter>
  </c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;

    const response = await this.request(credentials, calendarUrl, "REPORT", "1", body);
    const block = responseBlocks(await response.text()).find((entry) => tagContent(entry, "calendar-data"));
    if (!block) {
      return null;
    }

    const etag = tagContent(block, "getetag");
    return {
      href: new URL(unescapeXml(tagContent(block, "href") ?? ""), calendarUrl).toString(),
      etag: etag ? unescapeXml(etag) : null,
      ics: unescapeXml(tagContent(block, "calendar-data")!)
    };
  }

  /**
   * Writes an event resource. With an etag the write only succeeds if nobody changed it meanwhile;
   * with create=true it never overwrites an existing resource.
   */
  public async putEvent(credentials: CalDavCredentials, href: string, ics: string, options: { etag?: string | null; create?: boolean }): Promise<void> {
    const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8" };
    if (options.create) {
      headers["If-None-Match"] = "*";
    } else if (options.etag) {
      headers["If-Match"] = options.etag;
    }
    await this.write(credentials, href, "PUT", headers, ics);
  }

  public async deleteEvent(credentials: CalDavCredentials, href: string, etag: string | null): Promise<void> {
    await this.write(credentials, href, "DELETE", etag ? { "If-Match": etag } : {});
  }

  private async write(credentials: CalDavCredentials, url: string, method: "PUT" | "DELETE", headers: Record<string, string>, body?: string): Promise<void> {
    const response = await this.send(credentials, url, { method, headers, body });
    if (response.status === 412) {
      throw new CalDavError("conflict", "L'evento è stato modificato altrove nel frattempo. Ricarica e riprova.");
    }
    if (response.status === 403) {
      throw new CalDavError("forbidden", "Non hai il permesso di modificare questo calendario sul provider.");
    }
    if (!response.ok) {
      this.throwForStatus(response.status);
    }
  }

  private async discoverHomeUrl(credentials: CalDavCredentials): Promise<string> {
    let rootUrl = credentials.serverUrl;
    let response = await this.request(credentials, rootUrl, "PROPFIND", "0", PRINCIPAL_BODY, true);

    if (response.status === 404 || response.status === 405) {
      rootUrl = new URL("/.well-known/caldav", credentials.serverUrl).toString();
      response = await this.request(credentials, rootUrl, "PROPFIND", "0", PRINCIPAL_BODY);
    } else if (!response.ok) {
      this.throwForStatus(response.status);
    }

    const baseUrl = response.url || rootUrl;
    const xml = await response.text();
    const directHome = hrefInside(xml, "calendar-home-set");
    if (directHome) {
      return new URL(directHome, baseUrl).toString();
    }

    const principal = hrefInside(xml, "current-user-principal");
    if (!principal) {
      throw new CalDavError("not-found", "Il server non ha restituito un profilo CalDAV per questo account.");
    }

    const principalUrl = new URL(principal, baseUrl).toString();
    const principalResponse = await this.request(credentials, principalUrl, "PROPFIND", "0", PRINCIPAL_BODY);
    const home = hrefInside(await principalResponse.text(), "calendar-home-set");
    if (!home) {
      throw new CalDavError("not-found", "Il server non ha restituito i calendari di questo account.");
    }

    return new URL(home, principalResponse.url || principalUrl).toString();
  }

  private async request(
    credentials: CalDavCredentials,
    url: string,
    method: "PROPFIND" | "REPORT",
    depth: "0" | "1",
    body: string,
    allowNotFound = false
  ): Promise<Response> {
    const response = await this.send(credentials, url, {
      method,
      headers: { Depth: depth, Accept: "application/xml, text/xml", "Content-Type": "application/xml; charset=utf-8" },
      body
    });

    if (!response.ok && !(allowNotFound && (response.status === 404 || response.status === 405))) {
      this.throwForStatus(response.status);
    }

    return response;
  }

  private async send(
    credentials: CalDavCredentials,
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method: init.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
          ...init.headers
        },
        body: init.body,
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new CalDavError("network", `Server del calendario non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private throwForStatus(status: number): never {
    if (status === 401 || status === 403) {
      throw new CalDavError("auth", "Credenziali rifiutate dal server. Per iCloud usa una password specifica per app.");
    }
    if (status === 404) {
      throw new CalDavError("not-found", "Il calendario non esiste più sul server.");
    }
    throw new CalDavError("http", `Il server del calendario ha risposto HTTP ${status}.`);
  }
}
