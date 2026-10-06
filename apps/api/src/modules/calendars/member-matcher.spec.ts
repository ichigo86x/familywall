import { describe, expect, it } from "vitest";
import type { User } from "@familywall/shared";
import { buildMemberMatcher } from "./member-matcher";

const member = (id: string, displayName: string, keywords: string[] = [], role: User["role"] = "Child"): User => ({
  id,
  username: id,
  displayName,
  role,
  color: "#000000",
  disabled: false,
  keywords,
  canLogin: true, panelWrite: false
});

const match = buildMemberMatcher([
  member("luca", "Luca"),
  member("sofia", "Sofia", ["Sofi"]),
  member("nicolo", "Nicolò"),
  member("anna", "Anna", [], "Parent"),
  member("wall", "Wall", [], "Kiosk")
]);

describe("buildMemberMatcher", () => {
  it("finds members named in the title, in title order", () => {
    expect(match("Piscina Sofia e Luca")).toEqual(["sofia", "luca"]);
  });

  it("ignores case and accents", () => {
    expect(match("karate NICOLO")).toEqual(["nicolo"]);
    expect(match("Compleanno nicolò")).toEqual(["nicolo"]);
  });

  it("uses keywords and whole words only", () => {
    expect(match("Dentista Sofi")).toEqual(["sofia"]);
    expect(match("Lucarelli in visita")).toEqual([]);
    expect(match("Annamaria")).toEqual([]);
  });

  it("matches names next to punctuation", () => {
    expect(match("Luca/Anna: cena")).toEqual(["luca", "anna"]);
  });

  it("never assigns kiosk accounts", () => {
    expect(match("Wall test")).toEqual([]);
  });
});
