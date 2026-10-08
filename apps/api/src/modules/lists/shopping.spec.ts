import { describe, expect, it } from "vitest";
import { aisleOf, isShoppingList } from "@familywall/shared";

describe("aisleOf", () => {
  it("puts shopping items in their aisle", () => {
    expect(aisleOf("2 kg di patate").id).toBe("frutta");
    expect(aisleOf("Latte parzialmente scremato").id).toBe("latticini");
    expect(aisleOf("Tonno in scatola").id).toBe("dispensa");
    expect(aisleOf("Tonno fresco").id).toBe("carne");
    expect(aisleOf("Pastiglie lavastoviglie").id).toBe("casa");
    expect(aisleOf("Caffè").id).toBe("colazione");
    expect(aisleOf("Regalo per Sofia").id).toBe("altro");
  });

  it("recognises shopping lists by name", () => {
    expect(isShoppingList("Spesa")).toBe(true);
    expect(isShoppingList("Compiti")).toBe(false);
  });
});
