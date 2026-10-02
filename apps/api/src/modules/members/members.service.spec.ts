import { describe, expect, it } from "vitest";
import { createTestContext } from "../../test/test-context";

const setup = async () => {
  const ctx = createTestContext();
  const admin = (
    await ctx.auth.setup({ householdName: "Casa", username: "mario", displayName: "Mario", password: "very-long-password", color: "#2563EB" })
  ).user;
  return { ctx, admin };
};

describe("MembersService", () => {
  it("rejects duplicate usernames", async () => {
    const { ctx } = await setup();

    await expect(
      ctx.members.create({ username: "mario", displayName: "Other", role: "Parent", color: "#000000", password: "password1" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps at least one active Admin", async () => {
    const { ctx, admin } = await setup();

    expect(() => ctx.members.update(admin, admin.id, { role: "Parent" })).toThrow(/almeno un Admin attivo/);
    expect(() => ctx.members.update(admin, admin.id, { disabled: true })).toThrow();

    const second = await ctx.members.create({ username: "anna", displayName: "Anna", role: "Admin", color: "#DB2777", password: "password1" });
    expect(ctx.members.update(second, admin.id, { role: "Parent" }).role).toBe("Parent");
    expect(() => ctx.members.delete(admin, second.id)).toThrow(/almeno un Admin attivo/);
  });

  it("requires the current password for self-service changes only", async () => {
    const { ctx, admin } = await setup();
    const child = await ctx.members.create({ username: "sofia", displayName: "Sofia", role: "Child", color: "#EC4899", password: "password1" });

    await expect(ctx.members.setPassword(child, child.id, { password: "password2" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(ctx.members.setPassword(child, child.id, { password: "password2", currentPassword: "password1" })).resolves.toBeUndefined();
    await expect(ctx.members.setPassword(child, admin.id, { password: "hijacked1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ctx.members.setPassword(admin, child.id, { password: "password3" })).resolves.toBeUndefined();
  });

  it("never exposes password hashes", async () => {
    const { ctx } = await setup();

    expect(JSON.stringify(ctx.members.list())).not.toMatch(/scrypt/);
  });
});
