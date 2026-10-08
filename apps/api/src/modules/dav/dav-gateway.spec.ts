import { describe, expect, it } from "vitest";
import { davWriteAllowed } from "./dav-gateway.service";

describe("davWriteAllowed", () => {
  it("lets children tick lists and write notes, not change menu, birthdays or shifts", () => {
    expect(davWriteAllowed("Child", "PUT", "/famiglia/spesa/latte.ics")).toBe(true);
    expect(davWriteAllowed("Child", "PUT", "/famiglia/familywall-note/n1.ics")).toBe(true);
    expect(davWriteAllowed("Child", "PUT", "/famiglia/familywall-menu/d1.ics")).toBe(false);
    expect(davWriteAllowed("Child", "DELETE", "/famiglia/familywall-turni/s1.ics")).toBe(false);
    expect(davWriteAllowed("Child", "REPORT", "/famiglia/familywall-turni/")).toBe(true);
    expect(davWriteAllowed("Parent", "PUT", "/famiglia/familywall-compleanni/o1.ics")).toBe(true);
  });

  it("keeps the family collections themselves for the Admin", () => {
    expect(davWriteAllowed("Parent", "DELETE", "/famiglia/familywall-menu/")).toBe(false);
    expect(davWriteAllowed("Parent", "PROPPATCH", "/famiglia/familywall-menu")).toBe(false);
    expect(davWriteAllowed("Admin", "DELETE", "/famiglia/familywall-menu/")).toBe(true);
    expect(davWriteAllowed("Parent", "MKCALENDAR", "/famiglia/nuova-lista/")).toBe(true);
    expect(davWriteAllowed("Parent", "PROPPATCH", "/famiglia/")).toBe(false);
  });
});
