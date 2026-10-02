import { describe, expect, it } from "vitest";
import { createTestContext } from "../../test/test-context";
import { LoginThrottle } from "./login-throttle";

const setupInput = {
  householdName: "Casa Rossi",
  username: "mario",
  displayName: "Mario",
  password: "very-long-password",
  color: "#2563EB"
};

describe("AuthService", () => {
  it("allows setup exactly once and makes the first member Admin", async () => {
    const ctx = createTestContext();
    expect(ctx.auth.needsSetup()).toBe(true);

    const session = await ctx.auth.setup(setupInput);

    expect(session.user).toMatchObject({ username: "mario", role: "Admin" });
    expect(ctx.settings.get().householdName).toBe("Casa Rossi");
    expect(ctx.auth.needsSetup()).toBe(false);
    await expect(ctx.auth.setup({ ...setupInput, username: "intruder" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("logs in with username case-insensitively and rejects wrong passwords", async () => {
    const ctx = createTestContext();
    await ctx.auth.setup(setupInput);

    const session = await ctx.auth.login({ username: "MARIO", password: "very-long-password" }, "1.1.1.1");
    expect(ctx.auth.authenticateToken(session.token).id).toBe(session.user.id);

    await expect(ctx.auth.login({ username: "mario", password: "nope" }, "1.1.1.1")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("revokes existing tokens when the role changes or the password is reset", async () => {
    const ctx = createTestContext();
    const admin = (await ctx.auth.setup(setupInput)).user;
    const child = await ctx.members.create({ username: "luca", displayName: "Luca", role: "Child", color: "#14B8A6", password: "luca-pass" });
    const { token } = await ctx.auth.login({ username: "luca", password: "luca-pass" }, "2.2.2.2");

    ctx.members.update(admin, child.id, { role: "Parent" });
    expect(() => ctx.auth.authenticateToken(token)).toThrow(/non più valida/);

    const fresh = await ctx.auth.login({ username: "luca", password: "luca-pass" }, "2.2.2.2");
    await ctx.members.setPassword(admin, child.id, { password: "new-luca-pass" });
    expect(() => ctx.auth.authenticateToken(fresh.token)).toThrow(/non più valida/);
  });

  it("refuses disabled members", async () => {
    const ctx = createTestContext();
    const admin = (await ctx.auth.setup(setupInput)).user;
    const kiosk = await ctx.members.create({ username: "wall", displayName: "Wall", role: "Kiosk", color: "#111111", password: "kiosk-pass" });
    ctx.members.update(admin, kiosk.id, { disabled: true });

    await expect(ctx.auth.login({ username: "wall", password: "kiosk-pass" }, "3.3.3.3")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("LoginThrottle", () => {
  it("blocks after repeated failures and unblocks when the window expires", () => {
    let now = 0;
    const throttle = new LoginThrottle(3, 1000, () => now);
    const keys = ["ip:1", "user:mario"];

    throttle.recordFailure(keys);
    throttle.recordFailure(keys);
    expect(throttle.isBlocked(keys)).toBe(false);
    throttle.recordFailure(keys);
    expect(throttle.isBlocked(["ip:other", "user:mario"])).toBe(true);

    now = 1001;
    expect(throttle.isBlocked(keys)).toBe(false);
  });
});
