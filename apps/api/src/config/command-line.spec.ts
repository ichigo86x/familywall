import { describe, expect, it } from "vitest";
import { quoteCommandPart, splitCommand } from "./command-line";

describe("splitCommand", () => {
  it("splits plain commands and keeps quoted paths together", () => {
    expect(splitCommand("python3 -m radicale")).toEqual(["python3", "-m", "radicale"]);
    expect(splitCommand(`${quoteCommandPart("C:\Program Files\Python\python.exe")} -m radicale`)).toEqual(["C:\Program Files\Python\python.exe", "-m", "radicale"]);
    expect(splitCommand("  ")).toEqual([]);
  });

  it("uses an existing file path as is, even with spaces", () => {
    expect(splitCommand(__filename)).toEqual([__filename]);
  });
});
