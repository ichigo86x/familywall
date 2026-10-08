import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import { AppException } from "../../common/errors/app-exception";
import type { CollectionSpec, DavStore, StoredObject } from "./dav-store";
import type { IcsMapper, ReadContext } from "./family-ics";

const PRODID = "-//Familywall//Familywall//IT";

/** Store errors become 502 responses with their message; missing objects become 404. */
export const davFailure = (error: unknown): AppException =>
  error instanceof AppException ? error : AppException.providerError(error instanceof Error ? error.message : "Errore CalDAV.");

/**
 * Family objects of one kind in one collection of the built-in CalDAV server. Updates keep
 * what phones added (alarms, attendees...) and only change the properties Familywall owns.
 */
export class FamilyObjects<T extends { id: string }, F> {
  public constructor(
    private readonly store: DavStore,
    public readonly collection: CollectionSpec,
    private readonly mapper: IcsMapper<T, F>,
    private readonly context: () => ReadContext,
    private readonly notFound: string
  ) {}

  public ensure(): Promise<void> {
    return this.store.ensure(this.collection);
  }

  public async list(): Promise<T[]> {
    try {
      const context = this.context();
      return (await this.store.list(this.collection)).flatMap((object) => {
        const item = this.read(object, context);
        return item ? [item] : [];
      });
    } catch (error) {
      throw davFailure(error);
    }
  }

  public async find(id: string): Promise<T | undefined> {
    try {
      const object = await this.store.get(this.collection, id);
      return object ? (this.read(object, this.context()) ?? undefined) : undefined;
    } catch (error) {
      throw davFailure(error);
    }
  }

  /** With an id (data moved from the database) an object left by an interrupted move is overwritten. */
  public async create(fields: F, options: { id?: string; now?: Date } = {}): Promise<T> {
    const id = options.id ?? randomUUID();
    const now = options.now ?? new Date();
    const root = new ICAL.Component("vcalendar");
    root.updatePropertyWithValue("version", "2.0");
    root.updatePropertyWithValue("prodid", PRODID);
    const component = new ICAL.Component(this.mapper.component);
    component.updatePropertyWithValue("uid", id);
    component.updatePropertyWithValue("created", ICAL.Time.fromJSDate(now, true));
    root.addSubcomponent(component);
    this.mapper.write(component, fields, { now, created: true });
    this.stamp(component, now);
    try {
      await this.store.put(this.collection, id, root.toString(), { create: options.id === undefined });
    } catch (error) {
      throw davFailure(error);
    }
    return this.read({ id, ics: root.toString(), etag: null }, this.context())!;
  }

  public async update(id: string, fields: F): Promise<T> {
    const now = new Date();
    try {
      const current = await this.store.get(this.collection, id);
      const root = current ? new ICAL.Component(ICAL.parse(current.ics)) : null;
      const component = root?.getFirstSubcomponent(this.mapper.component);
      if (!current || !root || !component) {
        throw AppException.notFound(this.notFound);
      }
      this.mapper.write(component, fields, { now, created: false });
      this.stamp(component, now);
      component.updatePropertyWithValue("sequence", Number(component.getFirstPropertyValue("sequence") ?? 0) + 1);
      await this.store.put(this.collection, id, root.toString(), { etag: current.etag });
      return this.read({ id, ics: root.toString(), etag: null }, this.context())!;
    } catch (error) {
      throw davFailure(error);
    }
  }

  /** Changes one object in place (properties Familywall keeps outside the fields, e.g. chores done). */
  public async patch(id: string, mutate: (component: ICAL.Component) => void): Promise<T> {
    const now = new Date();
    try {
      const current = await this.store.get(this.collection, id);
      const root = current ? new ICAL.Component(ICAL.parse(current.ics)) : null;
      const component = root?.getFirstSubcomponent(this.mapper.component);
      if (!current || !root || !component) {
        throw AppException.notFound(this.notFound);
      }
      mutate(component);
      this.stamp(component, now);
      await this.store.put(this.collection, id, root.toString(), { etag: current.etag });
      return this.read({ id, ics: root.toString(), etag: null }, this.context())!;
    } catch (error) {
      throw davFailure(error);
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      if (!(await this.store.get(this.collection, id))) {
        throw AppException.notFound(this.notFound);
      }
      await this.store.remove(this.collection, id);
    } catch (error) {
      throw davFailure(error);
    }
  }

  private stamp(component: ICAL.Component, now: Date): void {
    const time = ICAL.Time.fromJSDate(now, true);
    component.updatePropertyWithValue("dtstamp", time);
    component.updatePropertyWithValue("last-modified", time);
  }

  /** Objects that are not readable (or not of this kind) are skipped rather than failing the page. */
  private read(object: StoredObject, context: ReadContext): T | null {
    try {
      const component = new ICAL.Component(ICAL.parse(object.ics)).getFirstSubcomponent(this.mapper.component);
      return component ? this.mapper.read(component, object.id, context) : null;
    } catch {
      return null;
    }
  }
}
