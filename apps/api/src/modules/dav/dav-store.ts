import { Logger } from "@nestjs/common";
import { escapeXmlText, responseBlocks, tagContent, unescapeXml } from "../providers/caldav/caldav-client";
import { DAV_FAMILY_USER } from "./radicale-process";

/** A collection of the family on the built-in CalDAV server. */
export interface CollectionSpec {
  /** Collection name inside the family principal (the URL segment). */
  name: string;
  displayName: string;
  color: string;
  component: "VEVENT" | "VJOURNAL";
}

/** One calendar object: id is the file name without ".ics". */
export interface StoredObject {
  id: string;
  ics: string;
  etag: string | null;
}

export class DavStoreError extends Error {}

/**
 * Family data kept on the built-in CalDAV server (menu, birthdays, shifts, notes):
 * Familywall stores only its configuration, phones sync the same collections.
 */
export abstract class DavStore {
  public abstract readonly enabled: boolean;
  /** Creates the collection when missing (it then shows up on the phones). */
  public abstract ensure(collection: CollectionSpec): Promise<void>;
  public abstract list(collection: CollectionSpec): Promise<StoredObject[]>;
  public abstract get(collection: CollectionSpec, id: string): Promise<StoredObject | undefined>;
  /** etag = only if unchanged; create = only if missing; neither = overwrite. */
  public abstract put(collection: CollectionSpec, id: string, ics: string, condition?: { etag?: string | null; create?: boolean }): Promise<void>;
  public abstract remove(collection: CollectionSpec, id: string): Promise<void>;
  /** Forget what was read (after a restore replaced the files). */
  public abstract clearCache(): void;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Phones may change the collections at any time: a read is reused only for a few seconds. */
const LIST_TTL_MS = 10_000;

const lastSegment = (href: string): string => decodeURIComponent(href.replace(/\/+$/, "").split("/").pop() ?? "");
export const objectId = (fileName: string): string => fileName.replace(/\.ics$/i, "");

const PROBE_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`;

const queryBody = (component: string) => `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="${component}"/></c:comp-filter></c:filter>
</c:calendar-query>`;

/** DavStore on the local Radicale, as the shared family user (same as the reminder lists). */
export class RadicaleDavStore extends DavStore {
  private readonly logger = new Logger("CalDAV");
  private readonly ensured = new Map<string, Promise<void>>();
  private readonly cache = new Map<string, { at: number; objects: StoredObject[] }>();

  public constructor(
    private readonly baseUrl: string,
    public readonly enabled: boolean,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {
    super();
  }

  private get home(): string {
    return `${this.baseUrl}/${DAV_FAMILY_USER}/`;
  }

  private collectionUrl(collection: CollectionSpec): string {
    return `${this.home}${encodeURIComponent(collection.name)}/`;
  }

  private objectUrl(collection: CollectionSpec, id: string): string {
    return `${this.collectionUrl(collection)}${encodeURIComponent(id)}.ics`;
  }

  public ensure(collection: CollectionSpec): Promise<void> {
    const running = this.ensured.get(collection.name);
    if (running) {
      return running;
    }
    const work = this.create(collection).catch((error: unknown) => {
      this.ensured.delete(collection.name);
      throw error;
    });
    this.ensured.set(collection.name, work);
    return work;
  }

  private async create(collection: CollectionSpec): Promise<void> {
    // Touching the principal makes Radicale create it.
    await this.send(this.home, "PROPFIND", PROBE_BODY, { Depth: "0", "Content-Type": "application/xml; charset=utf-8" });
    const probe = await this.send(this.collectionUrl(collection), "PROPFIND", PROBE_BODY, { Depth: "0", "Content-Type": "application/xml; charset=utf-8" });
    await probe.text();
    if (probe.status !== 404) {
      return;
    }
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:set><d:prop>
    <d:displayname>${escapeXmlText(collection.displayName)}</d:displayname>
    <a:calendar-color>${collection.color}FF</a:calendar-color>
    <c:supported-calendar-component-set><c:comp name="${collection.component}"/></c:supported-calendar-component-set>
  </d:prop></d:set>
</c:mkcalendar>`;
    const response = await this.send(this.collectionUrl(collection), "MKCALENDAR", body, { "Content-Type": "application/xml; charset=utf-8" });
    await this.expectOk(response, `creazione del calendario "${collection.displayName}"`);
    this.logger.log(`Collection "${collection.displayName}" created on the CalDAV server.`);
  }

  public async list(collection: CollectionSpec): Promise<StoredObject[]> {
    const cached = this.cache.get(collection.name);
    if (cached && Date.now() - cached.at < LIST_TTL_MS) {
      return cached.objects;
    }
    try {
      await this.ensure(collection);
      const response = await this.send(this.collectionUrl(collection), "REPORT", queryBody(collection.component), {
        Depth: "1",
        "Content-Type": "application/xml; charset=utf-8"
      });
      const xml = await this.expectOk(response, `lettura di "${collection.displayName}"`);
      const objects = responseBlocks(xml).flatMap((block): StoredObject[] => {
        const href = tagContent(block, "href");
        const data = tagContent(block, "calendar-data");
        return href && data ? [{ id: objectId(lastSegment(unescapeXml(href))), ics: unescapeXml(data), etag: tagContent(block, "getetag") ?? null }] : [];
      });
      this.cache.set(collection.name, { at: Date.now(), objects });
      return objects;
    } catch (error) {
      // The last good read is better than nothing on the wall.
      if (cached) {
        this.logger.warn(`Reading "${collection.displayName}" failed, using the last read: ${error instanceof Error ? error.message : String(error)}`);
        return cached.objects;
      }
      throw error;
    }
  }

  public async get(collection: CollectionSpec, id: string): Promise<StoredObject | undefined> {
    await this.ensure(collection);
    const response = await this.send(this.objectUrl(collection, id), "GET");
    if (response.status === 404) {
      await response.text();
      return undefined;
    }
    const ics = await this.expectOk(response, "lettura");
    return { id, ics, etag: response.headers.get("etag") };
  }

  public async put(collection: CollectionSpec, id: string, ics: string, condition: { etag?: string | null; create?: boolean } = {}): Promise<void> {
    await this.ensure(collection);
    const headers: Record<string, string> = { "Content-Type": "text/calendar; charset=utf-8" };
    if (condition.create) {
      headers["If-None-Match"] = "*";
    } else if (condition.etag) {
      headers["If-Match"] = condition.etag;
    }
    const response = await this.send(this.objectUrl(collection, id), "PUT", ics, headers);
    this.cache.delete(collection.name);
    await this.expectOk(response, "salvataggio");
  }

  public async remove(collection: CollectionSpec, id: string): Promise<void> {
    const response = await this.send(this.objectUrl(collection, id), "DELETE");
    this.cache.delete(collection.name);
    if (response.status !== 404) {
      await this.expectOk(response, "eliminazione");
    }
  }

  public clearCache(): void {
    this.cache.clear();
    this.ensured.clear();
  }

  private async send(url: string, method: string, body?: string, headers: Record<string, string> = {}): Promise<Response> {
    if (!this.enabled) {
      throw new DavStoreError("Server CalDAV interno non attivo: menu, compleanni, turni e note non sono disponibili.");
    }
    try {
      return await this.fetchImpl(url, {
        method,
        body,
        headers: { "X-Remote-User": DAV_FAMILY_USER, ...headers },
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new DavStoreError(`Server CalDAV interno non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async expectOk(response: Response, operation: string): Promise<string> {
    const text = await response.text();
    if (response.status === 412) {
      throw new DavStoreError("Il dato è stato modificato altrove nel frattempo. Ricarica e riprova.");
    }
    if (!response.ok) {
      throw new DavStoreError(`CalDAV: ${operation} non riuscita (HTTP ${response.status}).`);
    }
    return text;
  }
}
