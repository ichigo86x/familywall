import { describe, expect, it } from "vitest";
import { addCalendarSchema } from "@familywall/shared";
import { ClasseVivaClient, classeVivaUrl } from "./classeviva-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("ClasseVivaClient", () => {
  it("logs in like the app, lists a parent's children and reads homework and tests", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new ClasseVivaClient(async (url, init) => {
      calls.push({ url, init });
      const body = JSON.parse(String(init.body ?? "null")) as { ident: string | null } | null;
      if (url.endsWith("/auth/login")) {
        return body?.ident
          ? json({ ident: body.ident, token: "tok", expire: "2099-01-01T00:00:00+01:00" })
          : json({ choices: [{ ident: "G1234567X", name: "Luca Rossi" }, { ident: "G7654321Y", name: "Sofia Rossi" }] });
      }
      return json({
        agenda: [
          { evtId: 1, evtCode: "AGHW", evtDatetimeBegin: "2026-10-15T09:00:00+02:00", evtDatetimeEnd: "2026-10-15T10:00:00+02:00", isFullDay: false, notes: "Pag. 12 es. 3", authorName: "Prof", subjectDesc: "MATEMATICA" },
          { evtId: 2, evtCode: "AGNT", evtDatetimeBegin: "2026-10-16T10:00:00+02:00", evtDatetimeEnd: "2026-10-16T11:00:00+02:00", isFullDay: false, notes: "Verifica", authorName: "Prof", subjectDesc: "STORIA" }
        ]
      });
    });
    const credentials = { username: "G1234567X", password: "segreta" };

    expect(await client.identities(credentials)).toEqual([
      { ident: "G1234567X", name: "Luca Rossi" },
      { ident: "G7654321Y", name: "Sofia Rossi" }
    ]);
    const events = await client.fetchEvents(credentials, classeVivaUrl("G7654321Y"), new Date("2026-10-13T00:00:00Z"), new Date("2026-10-27T00:00:00Z"));

    expect(calls[0]!.init.headers).toMatchObject({ "Z-Dev-Apikey": "Tg1NWEwNGIgIC0K" });
    expect(calls.at(-1)!.url).toBe("https://web.spaggiari.eu/rest/v1/students/7654321/agenda/all/20261013/20261027");
    expect(calls.at(-1)!.init.headers).toMatchObject({ "Z-Auth-Token": "tok" });
    expect(events).toMatchObject([
      { uid: "classeviva-1", title: "📚 Matematica: Pag. 12 es. 3", allDay: true, startAt: "2026-10-15T00:00:00.000Z", endAt: "2026-10-16T00:00:00.000Z" },
      { uid: "classeviva-2", title: "📝 Storia: Verifica", allDay: false, startAt: "2026-10-16T08:00:00.000Z" }
    ]);
    // The calendar URL is accepted when the calendar is added.
    expect(addCalendarSchema.safeParse({ accountId: "a", remoteUrl: classeVivaUrl("G7654321Y"), name: "Scuola", color: "#0F766E" }).success).toBe(true);
  });

  it("reports a refused password", async () => {
    const client = new ClasseVivaClient(async () => json({ error: "auth" }, 422));
    await expect(client.identities({ username: "S1", password: "x" })).rejects.toThrow(/rifiutato/);
  });
});
