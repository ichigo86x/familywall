import { randomUUID } from "node:crypto";
import ICAL from "ical.js";
import type { TaskItem } from "@familywall/shared";
import { escapeXmlText, responseBlocks, tagContent, unescapeXml } from "../providers/caldav/caldav-client";
import { DAV_FAMILY_USER } from "./radicale-process";

/** Completed reminders stay visible (struck through) for two days, like Google lists. */
const COMPLETED_VISIBLE_MS = 2 * 24 * 60 * 60 * 1000;

export interface DavTaskList {
  /** Collection name inside the family principal, e.g. "spesa". */
  name: string;
  displayName: string;
  color: string | null;
}

export class DavTasksError extends Error {}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const PRODID = "-//Familywall//Familywall//IT";

const LISTS_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/><a:calendar-color/></d:prop>
</d:propfind>`;

const TASKS_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop><d:getetag/><c:calendar-data/></d:prop>
  <c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VTODO"/></c:comp-filter></c:filter>
</c:calendar-query>`;

const lastSegment = (href: string): string => decodeURIComponent(href.replace(/\/+$/, "").split("/").pop() ?? "");

/**
 * Reads and writes the family reminder lists (VTODO collections) directly on the local
 * Radicale, as the shared family user. The same lists appear in iOS Reminders through
 * the CalDAV gateway.
 */
export class DavTasksClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now
  ) {}

  private get home(): string {
    return `${this.baseUrl}/${DAV_FAMILY_USER}/`;
  }

  public async lists(): Promise<DavTaskList[]> {
    const response = await this.send(this.home, "PROPFIND", LISTS_BODY, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" });
    if (response.status === 404) {
      return [];
    }
    const xml = await this.expectOk(response, "lettura delle liste");
    return responseBlocks(xml).flatMap((block): DavTaskList[] => {
      const href = tagContent(block, "href");
      const resourceType = tagContent(block, "resourcetype") ?? "";
      if (!href || !/<(?:[\w-]+:)?calendar\b/i.test(resourceType)) {
        return [];
      }
      const components = [...block.matchAll(/<(?:[\w-]+:)?comp\b[^>]*name="([^"]+)"/gi)].map((match) => match[1]!.toUpperCase());
      if (components.length > 0 && !components.includes("VTODO")) {
        return [];
      }
      const name = lastSegment(unescapeXml(href));
      return [
        {
          name,
          displayName: unescapeXml(tagContent(block, "displayname") ?? "") || name,
          color: tagContent(block, "calendar-color")?.match(/#[0-9a-f]{6}/i)?.[0]?.toUpperCase() ?? null
        }
      ];
    });
  }

  /** First start: an empty home gets a "Spesa" list, so iPhones have something to show. */
  public async ensureDefaultList(): Promise<void> {
    // Touching the principal makes Radicale create it.
    await this.send(this.home, "PROPFIND", LISTS_BODY, { Depth: "0", "Content-Type": "application/xml; charset=utf-8" });
    if ((await this.lists()).length > 0) {
      return;
    }
    await this.createList("spesa", "Spesa", "#F97316");
  }

  public async createList(name: string, displayName: string, color: string): Promise<void> {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">
  <d:set><d:prop>
    <d:displayname>${escapeXmlText(displayName)}</d:displayname>
    <a:calendar-color>${color}FF</a:calendar-color>
    <c:supported-calendar-component-set><c:comp name="VTODO"/></c:supported-calendar-component-set>
  </d:prop></d:set>
</c:mkcalendar>`;
    const response = await this.send(`${this.home}${encodeURIComponent(name)}/`, "MKCALENDAR", body, { "Content-Type": "application/xml; charset=utf-8" });
    await this.expectOk(response, "creazione della lista");
  }

  /** Open reminders plus the ones completed in the last two days. */
  public async tasks(listName: string): Promise<TaskItem[]> {
    const threshold = this.now() - COMPLETED_VISIBLE_MS;
    return (await this.allTasks(listName)).filter((task) => !task.completed || (task.completedAt !== null && Date.parse(task.completedAt) >= threshold));
  }

  /** Every reminder of the list, completed ones included (the history used for suggestions). */
  public async allTasks(listName: string): Promise<TaskItem[]> {
    const response = await this.send(this.listUrl(listName), "REPORT", TASKS_BODY, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" });
    const xml = await this.expectOk(response, "lettura della lista");

    return responseBlocks(xml)
      .flatMap((block): TaskItem[] => {
        const href = tagContent(block, "href");
        const data = tagContent(block, "calendar-data");
        if (!href || !data) {
          return [];
        }
        const todo = new ICAL.Component(ICAL.parse(unescapeXml(data))).getFirstSubcomponent("vtodo");
        if (!todo) {
          return [];
        }
        const completedProp = todo.getFirstPropertyValue("completed");
        const completedAt = completedProp instanceof ICAL.Time ? completedProp.toJSDate().toISOString() : null;
        const completed = String(todo.getFirstPropertyValue("status") ?? "").toUpperCase() === "COMPLETED" || completedAt !== null;
        const due = todo.getFirstPropertyValue("due");
        return [
          {
            id: lastSegment(unescapeXml(href)),
            title: String(todo.getFirstPropertyValue("summary") ?? "").trim(),
            notes: todo.getFirstPropertyValue("description") ? String(todo.getFirstPropertyValue("description")) : null,
            completed,
            completedAt,
            due: due instanceof ICAL.Time ? due.toJSDate().toISOString() : null
          }
        ];
      })
      .filter((task) => task.title !== "");
  }

  public async createTask(listName: string, title: string): Promise<string> {
    const uid = randomUUID();
    const root = new ICAL.Component("vcalendar");
    root.updatePropertyWithValue("version", "2.0");
    root.updatePropertyWithValue("prodid", PRODID);
    const todo = new ICAL.Component("vtodo");
    const now = ICAL.Time.fromJSDate(new Date(this.now()), true);
    todo.updatePropertyWithValue("uid", uid);
    todo.updatePropertyWithValue("summary", title);
    todo.updatePropertyWithValue("status", "NEEDS-ACTION");
    todo.updatePropertyWithValue("created", now);
    todo.updatePropertyWithValue("dtstamp", now);
    todo.updatePropertyWithValue("last-modified", now);
    root.addSubcomponent(todo);

    const id = `${uid}.ics`;
    const response = await this.send(`${this.listUrl(listName)}${id}`, "PUT", root.toString(), {
      "Content-Type": "text/calendar; charset=utf-8",
      "If-None-Match": "*"
    });
    await this.expectOk(response, "aggiunta");
    return id;
  }

  public async updateTask(listName: string, taskId: string, patch: { title?: string; completed?: boolean }): Promise<void> {
    const url = `${this.listUrl(listName)}${encodeURIComponent(taskId)}`;
    const current = await this.send(url, "GET");
    const ics = await this.expectOk(current, "lettura del promemoria");
    const etag = current.headers.get("etag");

    const root = new ICAL.Component(ICAL.parse(ics));
    const todo = root.getFirstSubcomponent("vtodo");
    if (!todo) {
      throw new DavTasksError("Promemoria non valido.");
    }
    const now = ICAL.Time.fromJSDate(new Date(this.now()), true);
    if (patch.title !== undefined) {
      todo.updatePropertyWithValue("summary", patch.title);
    }
    if (patch.completed !== undefined) {
      todo.updatePropertyWithValue("status", patch.completed ? "COMPLETED" : "NEEDS-ACTION");
      if (patch.completed) {
        todo.updatePropertyWithValue("completed", now);
        todo.updatePropertyWithValue("percent-complete", 100);
      } else {
        todo.removeAllProperties("completed");
        todo.removeAllProperties("percent-complete");
      }
    }
    todo.updatePropertyWithValue("last-modified", now);
    todo.updatePropertyWithValue("dtstamp", now);
    const sequence = Number(todo.getFirstPropertyValue("sequence") ?? 0);
    todo.updatePropertyWithValue("sequence", sequence + 1);

    const response = await this.send(url, "PUT", root.toString(), {
      "Content-Type": "text/calendar; charset=utf-8",
      ...(etag ? { "If-Match": etag } : {})
    });
    await this.expectOk(response, "modifica");
  }

  public async deleteTask(listName: string, taskId: string): Promise<void> {
    const response = await this.send(`${this.listUrl(listName)}${encodeURIComponent(taskId)}`, "DELETE");
    if (response.status !== 404) {
      await this.expectOk(response, "eliminazione");
    }
  }

  private listUrl(listName: string): string {
    return `${this.home}${encodeURIComponent(listName)}/`;
  }

  private async send(url: string, method: string, body?: string, headers: Record<string, string> = {}): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method,
        body,
        headers: { "X-Remote-User": DAV_FAMILY_USER, ...headers },
        signal: AbortSignal.timeout(10_000)
      });
    } catch (error) {
      throw new DavTasksError(`Server CalDAV interno non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async expectOk(response: Response, operation: string): Promise<string> {
    const text = await response.text();
    if (response.status === 412) {
      throw new DavTasksError("Il promemoria è stato modificato altrove nel frattempo. Ricarica e riprova.");
    }
    if (!response.ok) {
      throw new DavTasksError(`CalDAV: ${operation} non riuscita (HTTP ${response.status}).`);
    }
    return text;
  }
}
