import { describe, expect, it } from "vitest";
import { isNightTime } from "@familywall/shared";

const at = (hours: number, minutes = 0) => new Date(2026, 9, 7, hours, minutes);

describe("isNightTime", () => {
  it("handles windows across midnight and on the same day", () => {
    const night = { enabled: true, start: "23:00", end: "06:30" };
    expect([at(22, 59), at(23), at(2), at(6, 29), at(6, 30)].map((time) => isNightTime(night, time))).toEqual([false, true, true, true, false]);

    const nap = { enabled: true, start: "13:00", end: "15:00" };
    expect([at(12, 59), at(14), at(15)].map((time) => isNightTime(nap, time))).toEqual([false, true, false]);

    expect(isNightTime({ ...night, enabled: false }, at(2))).toBe(false);
  });
});
