import { describe, expect, it } from "vitest";
import { userCan } from "@familywall/shared";

describe("userCan", () => {
  it("gives wall panels write rights only in write mode", () => {
    expect(userCan({ role: "Kiosk", panelWrite: false }, "events:write")).toBe(false);
    expect(userCan({ role: "Kiosk", panelWrite: true }, "events:write")).toBe(true);
    expect(userCan({ role: "Kiosk", panelWrite: true }, "lists:write")).toBe(true);
    expect(userCan({ role: "Kiosk", panelWrite: true }, "members:manage")).toBe(false);
    expect(userCan({ role: "Child", panelWrite: true }, "events:write")).toBe(false);
  });
});
