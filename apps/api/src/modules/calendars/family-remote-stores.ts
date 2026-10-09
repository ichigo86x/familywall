import { createHash } from "node:crypto";
import ICAL from "ical.js";
import { DavStore, DavStoreError, objectId, type CollectionSpec, type StoredObject } from "../dav/dav-store";
import { CalDavClient, CalDavError, eventResourceUrl, type CalDavCredentials } from "../providers/caldav/caldav-client";
import { GoogleClient, GoogleError, type GoogleEventJson, type GoogleSecret } from "../providers/google/google-client";

/**
 * Menu and birthdays kept on a calendar of the family's provider (iCloud, other CalDAV servers, Google)
 * instead of the built-in server: the same objects, read and written through the provider.
 * The collection argument is ignored: each store is bound to one calendar.
 */

/** Provider calendars are slower than the built-in server: a read is reused for a minute. */
const LIST_TTL_MS = 60_000;

const PRODID = "-//Familywall//Familywall//IT";
const X_PREFIX = "X-FAMILYWALL-";

const failure = (error: unknown): DavStoreError =>
  new DavStoreError(error instanceof CalDavError || error instanceof GoogleError ? error.message : `Calendario non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);

/** Shared cache of the last list, kept on errors (the wall shows the last good data). */
abstract class CachedStore extends DavStore {
  public readonly enabled = true;
  private cache: { at: number; objects: StoredObject[] } | null = null;

  public ensure(): Promise<void> {
    return Promise.resolve();
  }

  public async list(): Promise<StoredObject[]> {
    if (this.cache && Date.now() - this.cache.at < LIST_TTL_MS) {
      return this.cache.objects;
    }
    try {
      const objects = await this.read();
      this.cache = { at: Date.now(), objects };
      return objects;
    } catch (error) {
      if (this.cache) {
        return this.cache.objects;
      }
      throw failure(error);
    }
  }

  public clearCache(): void {
    this.cache = null;
  }

  protected abstract read(): Promise<StoredObject[]>;
}

/** A calendar on a CalDAV server of the family (iCloud, Nextcloud, ...). */
export class RemoteCalDavStore extends CachedStore {
  /** Resources created on phones may have any file name: the last list tells where each object is. */
  private readonly hrefs = new Map<string, string>();

  public constructor(
    private readonly client: CalDavClient,
    private readonly credentials: CalDavCredentials,
    private readonly calendarUrl: string
  ) {
    super();
  }

  protected async read(): Promise<StoredObject[]> {
    const resources = await this.client.listResources(this.credentials, this.calendarUrl);
    return resources.map((resource) => {
      const id = objectId(decodeURIComponent(resource.href.replace(/\/+$/, "").split("/").pop() ?? ""));
      this.hrefs.set(id, resource.href);
      return { id, ics: resource.ics, etag: resource.etag };
    });
  }

  private href(id: string): string {
    return this.hrefs.get(id) ?? eventResourceUrl(this.calendarUrl, id);
  }

  public async get(_collection: CollectionSpec, id: string): Promise<StoredObject | undefined> {
    try {
      const resource = await this.client.getResource(this.credentials, this.href(id));
      return resource ? { id, ics: resource.ics, etag: resource.etag } : undefined;
    } catch (error) {
      throw failure(error);
    }
  }

  public async put(_collection: CollectionSpec, id: string, ics: string, condition: { etag?: string | null; create?: boolean } = {}): Promise<void> {
    try {
      await this.client.putEvent(this.credentials, this.href(id), ics, condition);
      this.clearCache();
    } catch (error) {
      throw failure(error);
    }
  }

  public async remove(_collection: CollectionSpec, id: string): Promise<void> {
    try {
      await this.client.deleteEvent(this.credentials, this.href(id), null);
      this.clearCache();
    } catch (error) {
      if (error instanceof CalDavError && error.kind === "not-found") {
        return;
      }
      throw failure(error);
    }
  }
}

/** Google event ids use the letters a-v and digits: other ids (UUIDs from the built-in server) are mapped. */
export const googleEventId = (id: string): string => {
  const plain = id.toLowerCase().replace(/-/g, "");
  return /^[a-v0-9]{5,1024}$/.test(plain) ? plain : createHash("sha1").update(id).digest("hex");
};

const icsDate = (value: { date?: string; dateTime?: string } | undefined): ICAL.Time | null => {
  if (value?.date) {
    return ICAL.Time.fromDateString(value.date);
  }
  return value?.dateTime ? ICAL.Time.fromJSDate(new Date(value.dateTime), true) : null;
};

/** A Google event as iCalendar, so the same readers work on every calendar. */
export const googleToIcs = (event: GoogleEventJson): string | null => {
  const start = icsDate(event.start);
  if (!start) {
    return null;
  }
  const root = new ICAL.Component("vcalendar");
  root.updatePropertyWithValue("version", "2.0");
  root.updatePropertyWithValue("prodid", PRODID);
  const component = new ICAL.Component("vevent");
  component.updatePropertyWithValue("uid", event.id);
  component.updatePropertyWithValue("summary", event.summary ?? "");
  if (event.description) {
    component.updatePropertyWithValue("description", event.description);
  }
  component.updatePropertyWithValue("dtstart", start);
  const end = icsDate(event.end);
  if (end) {
    component.updatePropertyWithValue("dtend", end);
  }
  for (const line of event.recurrence ?? []) {
    if (line.toUpperCase().startsWith("RRULE:")) {
      component.addPropertyWithValue("rrule", ICAL.Recur.fromString(line.slice(6)));
    }
  }
  if (event.transparency === "transparent") {
    component.updatePropertyWithValue("transp", "TRANSPARENT");
  }
  for (const [key, value] of Object.entries(event.extendedProperties?.private ?? {})) {
    if (key.startsWith(X_PREFIX)) {
      component.updatePropertyWithValue(key.toLowerCase(), value);
    }
  }
  root.addSubcomponent(component);
  return root.toString();
};

const googleTime = (time: ICAL.Time): { date?: string; dateTime?: string } =>
  time.isDate ? { date: time.toString().slice(0, 10) } : { dateTime: time.toJSDate().toISOString() };

/** The iCalendar object written by Familywall as a Google event (Familywall's own properties go in the private extended properties). */
export const icsToGoogle = (id: string, ics: string): GoogleEventJson => {
  const component = new ICAL.Component(ICAL.parse(ics)).getFirstSubcomponent("vevent");
  const start = component?.getFirstPropertyValue("dtstart");
  if (!component || !(start instanceof ICAL.Time)) {
    throw new DavStoreError("Evento non valido.");
  }
  const endValue = component.getFirstPropertyValue("dtend");
  const end = endValue instanceof ICAL.Time ? endValue : start.clone();
  if (!(endValue instanceof ICAL.Time) && start.isDate) {
    end.adjust(1, 0, 0, 0);
  }
  const extra: Record<string, string> = {};
  for (const property of component.getAllProperties()) {
    const name = property.name.toUpperCase();
    if (name.startsWith(X_PREFIX)) {
      extra[name] = String(property.getFirstValue() ?? "");
    }
  }
  const rules = component.getAllProperties("rrule").map((property) => `RRULE:${String(property.getFirstValue())}`);
  const description = component.getFirstPropertyValue("description");
  return {
    id: googleEventId(id),
    summary: String(component.getFirstPropertyValue("summary") ?? ""),
    ...(description ? { description: String(description) } : {}),
    start: googleTime(start),
    end: googleTime(end),
    ...(rules.length > 0 ? { recurrence: rules } : {}),
    transparency: component.getFirstPropertyValue("transp") === "TRANSPARENT" ? "transparent" : "opaque",
    extendedProperties: { private: extra }
  };
};

/** A Google calendar of the family. */
export class GoogleCalendarStore extends CachedStore {
  public constructor(
    private readonly client: GoogleClient,
    private readonly secret: GoogleSecret,
    private readonly remoteUrl: string
  ) {
    super();
  }

  protected async read(): Promise<StoredObject[]> {
    const events = await this.client.listEventsRaw(this.secret, this.remoteUrl);
    return events.flatMap((event): StoredObject[] => {
      const ics = googleToIcs(event);
      return ics ? [{ id: event.id, ics, etag: event.etag ?? null }] : [];
    });
  }

  public async get(_collection: CollectionSpec, id: string): Promise<StoredObject | undefined> {
    try {
      const event = await this.client.getEventRaw(this.secret, this.remoteUrl, googleEventId(id));
      const ics = event ? googleToIcs(event) : null;
      return event && ics ? { id, ics, etag: event.etag ?? null } : undefined;
    } catch (error) {
      throw failure(error);
    }
  }

  public async put(_collection: CollectionSpec, id: string, ics: string, condition: { etag?: string | null; create?: boolean } = {}): Promise<void> {
    try {
      await this.client.putEventRaw(this.secret, this.remoteUrl, icsToGoogle(id, ics), condition.create === true);
      this.clearCache();
    } catch (error) {
      throw failure(error);
    }
  }

  public async remove(_collection: CollectionSpec, id: string): Promise<void> {
    try {
      await this.client.deleteEventRaw(this.secret, this.remoteUrl, googleEventId(id));
      this.clearCache();
    } catch (error) {
      throw failure(error);
    }
  }
}
