import { describe, expect, it } from "vitest";
import { addCalendarSchema } from "@familywall/shared";
import { ClasseVivaClient, classeVivaUrl, homeworksToEvents, itemsOf } from "./classeviva-client";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

const v1Login = (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body ?? "null")) as { ident: string | null } | null;
  return body?.ident
    ? json({ ident: body.ident, token: "tok", expire: "2099-01-01T00:00:00+01:00" })
    : json({ choices: [{ ident: "G1234567X", name: "Luca Rossi" }, { ident: "G7654321Y", name: "Sofia Rossi" }] });
};

describe("ClasseVivaClient", () => {
  it("lists a parent's children with the app login", async () => {
    const client = new ClasseVivaClient(async (url, init) => v1Login(url, init));
    expect(await client.identities({ username: "genitore@example.com", password: "segreta" })).toEqual([
      { ident: "G1234567X", name: "Luca Rossi" },
      { ident: "G7654321Y", name: "Sofia Rossi" }
    ]);
    expect(addCalendarSchema.safeParse({ accountId: "a", remoteUrl: classeVivaUrl("G7654321Y"), name: "Scuola", color: "#0F766E" }).success).toBe(true);
  });

  it("reads Compiti, agenda and Didattica from the web portal, once each", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new ClasseVivaClient(async (url, init) => {
      calls.push({ url, init });
      if (url.includes("AuthApi4.php")) {
        return json({ data: { auth: { loggedIn: true, accountInfo: { id: 7654321 } } } }, 200, { "Set-Cookie": "PHPSESSID=abc123; path=/" });
      }
      if (url.endsWith("/misc/whoami")) {
        return json({ id: "7654321" });
      }
      if (url.endsWith("/homeworks/index")) {
        return json({
          items: [
            { id: 10, subjectDesc: "MATEMATICA", teacherName: "Prof. Bianchi", date: "2026-10-12", dueDate: "2026-10-15", text: "Pag. 12 es. 3\nanche il 4" },
            { id: 11, subjectDesc: "STORIA", date: "2026-01-01", dueDate: "2026-01-02", text: "vecchio" }
          ]
        });
      }
      if (url.includes("/agendav2/all/")) {
        return json({
          agenda: [
            { evtId: 1, evtCode: "AGHW", evtDatetimeBegin: "2026-10-15T09:00:00+02:00", evtDatetimeEnd: "2026-10-15T10:00:00+02:00", isFullDay: false, notes: "Pag. 12 es. 3", authorName: "Prof", subjectDesc: "MATEMATICA", homeworkId: 10 },
            { evtId: 2, evtCode: "AGNT", evtDatetimeBegin: "2026-10-16T10:00:00+02:00", evtDatetimeEnd: "2026-10-16T11:00:00+02:00", isFullDay: false, notes: "Verifica", authorName: "Prof", subjectDesc: "STORIA", homeworkId: null }
          ]
        });
      }
      if (url.endsWith("/didactics")) {
        return json({ didacticts: [{ folderId: 5, folderName: "Inglese", lastShareDT: "2026-10-14T08:00:00+02:00" }, { folderId: 6, folderName: "Vecchia", lastShareDT: "2025-01-01T08:00:00+01:00" }] });
      }
      if (url.endsWith("/didactics/5")) {
        return json({ contents: [{ contentId: 50, contentName: "Esercizi unit 3.pdf", shareDT: "2026-10-14T08:00:00+02:00" }] });
      }
      return json({}, 404);
    });

    const events = await client.fetchEvents({ username: "genitore@example.com", password: "segreta" }, classeVivaUrl("G7654321Y"), new Date("2026-10-13T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));

    expect(new URLSearchParams(String(calls[0]!.init.body)).get("uid")).toBe("G7654321Y");
    expect(calls.find((call) => call.url.endsWith("/homeworks/index"))!.init.headers).toMatchObject({ Cookie: "PHPSESSID=abc123" });
    expect(calls.map((call) => call.url.replace("https://web.spaggiari.eu", ""))).toContain("/rest/w1/students/7654321/agendav2/all/20261013/20261027");
    // Folders with nothing new are not opened.
    expect(calls.some((call) => call.url.endsWith("/didactics/6"))).toBe(false);
    expect(events.map((event) => [event.title, event.startAt.slice(0, 10)])).toEqual([
      ["📚 Matematica: Pag. 12 es. 3", "2026-10-15"],
      ["📝 Storia: Verifica", "2026-10-16"],
      ["📎 Inglese: Esercizi unit 3.pdf", "2026-10-14"]
    ]);
    expect(events[0]!.description).toBe("Pag. 12 es. 3\nanche il 4\n(Prof. Bianchi)");

    // The web session is reused.
    const logins = calls.filter((call) => call.url.includes("AuthApi4.php")).length;
    await client.fetchEvents({ username: "genitore@example.com", password: "segreta" }, classeVivaUrl("G7654321Y"), new Date("2026-10-13T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));
    expect(calls.filter((call) => call.url.includes("AuthApi4.php")).length).toBe(logins);
  });

  it("falls back to the app agenda, a month at a time, when the web login is refused", async () => {
    const calls: string[] = [];
    const client = new ClasseVivaClient(async (url, init) => {
      calls.push(url);
      if (url.includes("AuthApi4.php")) {
        return json({ data: { auth: { loggedIn: false, errors: ["password errata"] } } });
      }
      if (url.endsWith("/auth/login")) {
        return v1Login(url, init);
      }
      return json({ agenda: [{ evtId: 1, evtCode: "AGHW", evtDatetimeBegin: "2026-10-15T09:00:00+02:00", evtDatetimeEnd: "2026-10-15T10:00:00+02:00", isFullDay: false, notes: "Pag. 12", authorName: "Prof", subjectDesc: "MATEMATICA" }] });
    });
    const events = await client.fetchEvents({ username: "G1234567X", password: "x" }, classeVivaUrl("G1234567X"), new Date("2026-09-13T00:00:00Z"), new Date("2026-11-13T00:00:00Z"));
    expect(calls.filter((url) => url.includes("/rest/v1/students/")).map((url) => url.split("/agenda/all/")[1])).toEqual(["20260913/20261013", "20261014/20261113"]);
    expect(events).toMatchObject([{ uid: "classeviva-1", title: "📚 Matematica: Pag. 12", allDay: true, startAt: "2026-10-15T00:00:00.000Z" }]);
  });

  it("reports a refused password", async () => {
    const client = new ClasseVivaClient(async () => json({ error: "auth" }, 422));
    await expect(client.identities({ username: "S1", password: "x" })).rejects.toThrow(/rifiutato/);
  });

  it("reads homework in other shapes of the answer", () => {
    const body = { homeworks: { items: [{ homeworkId: 7, subject: { description: "SCIENZE" }, expiryDate: "16/10/2026", notes: "Ripassare cap. 2" }] } };
    expect(homeworksToEvents(itemsOf(body, ["items", "homeworks"]))).toMatchObject([
      { uid: "classeviva-hw-7", title: "📚 Scienze: Ripassare cap. 2", startAt: "2026-10-16T00:00:00.000Z" }
    ]);
    expect(itemsOf([{ a: 1 }], ["items"])).toEqual([{ a: 1 }]);
    // The shape the portal answers today (Compiti): text in homeworkDesc, done when ticked in the app.
    const portal = { items: [
      { evtId: 31, evtCode: "AGHW", teacherName: "Prof. Bianchi", homeworkDesc: "Pag. 40 es. 1-5", homeworkDone: false, homeworkMarkedDone: false, assignmentDate: "2026-10-12", expiryDate: "2026-10-15", subjectDesc: "MATEMATICA" },
      { evtId: 32, evtCode: "AGHW", teacherName: "Prof. Verdi", homeworkDesc: "Leggere cap. 3", homeworkDone: false, homeworkMarkedDone: true, assignmentDate: "2026-10-12", expiryDate: "2026-10-14", subjectDesc: "ITALIANO" }
    ] };
    expect(homeworksToEvents(itemsOf(portal, ["items"]))).toMatchObject([
      { uid: "classeviva-hw-31", title: "📚 Matematica: Pag. 40 es. 1-5", startAt: "2026-10-15T00:00:00.000Z", description: "Pag. 40 es. 1-5\n(Prof. Bianchi)" },
      { uid: "classeviva-hw-32", title: "✅ Italiano: Leggere cap. 3", startAt: "2026-10-14T00:00:00.000Z" }
    ]);
  });

  it("opens the portal with the account username when a child code is refused, only for that same child", async () => {
    const tried: string[] = [];
    const client = new ClasseVivaClient(async (url, init) => {
      if (url.includes("AuthApi4.php")) {
        const uid = new URLSearchParams(String(init.body)).get("uid")!;
        tried.push(uid);
        return uid === "genitore@example.com"
          ? json({ data: { auth: { loggedIn: true, accountInfo: { id: 1234567 } } } }, 200, { "Set-Cookie": "PHPSESSID=s1; path=/" })
          : json({ data: { auth: { loggedIn: false, errors: ["Identificativo o password errati"] } } });
      }
      if (url.endsWith("/misc/whoami")) {
        return json({ id: "1234567" });
      }
      if (url.endsWith("/auth/login")) {
        return v1Login(url, init);
      }
      return url.includes("/rest/w1/") ? json({ items: [], agenda: [] }) : json({ agenda: [] });
    });
    const credentials = { username: "genitore@example.com", password: "segreta" };
    await client.fetchEvents(credentials, classeVivaUrl("G1234567X"), new Date("2026-10-13T00:00:00Z"), new Date("2026-10-20T00:00:00Z"));
    expect(tried).toEqual(["G1234567X", "genitore@example.com"]);
    // Another child: the username opens student 1234567, not 7654321, so the app agenda is used instead.
    const events = await client.fetchEvents(credentials, classeVivaUrl("G7654321Y"), new Date("2026-10-13T00:00:00Z"), new Date("2026-10-20T00:00:00Z"));
    expect(events).toEqual([]);
  });
});
