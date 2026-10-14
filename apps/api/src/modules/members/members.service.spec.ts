import { describe, expect, it } from "vitest";
import { AVATAR_PHOTO_MAX_LENGTH, setAvatarSchema } from "@familywall/shared";
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

  it("sets a member's picture: their own, or anyone's for an Admin", async () => {
    const { ctx, admin } = await setup();
    const child = await ctx.members.create({ username: "luca", displayName: "Luca", role: "Child", color: "#16A34A", password: "password1" });
    const photo = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

    expect(ctx.members.setAvatar(child, child.id, { avatar: "🦖" }).avatar).toBe("🦖");
    expect(() => ctx.members.setAvatar(child, admin.id, { avatar: "🦖" })).toThrow(/solo la tua foto/);
    expect(ctx.members.setAvatar(admin, child.id, { avatar: photo }).avatar).toBe(photo);
    expect(ctx.members.list().find((member) => member.id === child.id)?.avatar).toBe(photo);
    expect(ctx.members.setAvatar(admin, child.id, { avatar: null }).avatar).toBeNull();

    expect(setAvatarSchema.safeParse({ avatar: "👩🏽‍💻" }).success).toBe(true);
    expect(setAvatarSchema.safeParse({ avatar: "ciao" }).success).toBe(false);
    expect(setAvatarSchema.safeParse({ avatar: "data:text/html;base64,PHNjcmlwdD4=" }).success).toBe(false);
    expect(setAvatarSchema.safeParse({ avatar: `data:image/png;base64,${"A".repeat(AVATAR_PHOTO_MAX_LENGTH)}` }).success).toBe(false);
  });

  it("supports tag-only children that cannot sign in", async () => {
    const { ctx, admin } = await setup();
    const tag = await ctx.members.create({ username: "nonno", displayName: "Nonno", role: "Child", color: "#65A30D", loginEnabled: false });

    expect(tag.canLogin).toBe(false);
    await expect(ctx.auth.login({ username: "nonno", password: "" }, "127.0.0.1")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(() => ctx.members.update(admin, tag.id, { role: "Parent" })).toThrow(/Solo i figli/);

    await ctx.members.setPassword(admin, tag.id, { password: "password1" });
    expect(ctx.members.list().find((member) => member.id === tag.id)?.canLogin).toBe(true);
    await expect(ctx.auth.login({ username: "nonno", password: "password1" }, "127.0.0.1")).resolves.toBeDefined();

    const child = await ctx.members.create({ username: "luca", displayName: "Luca", role: "Child", color: "#F97316", password: "password1" });
    expect(ctx.members.update(admin, child.id, { loginEnabled: false }).canLogin).toBe(false);
    await expect(ctx.auth.login({ username: "luca", password: "password1" }, "127.0.0.1")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("never exposes password hashes", async () => {
    const { ctx } = await setup();

    expect(JSON.stringify(ctx.members.list())).not.toMatch(/scrypt/);
  });
});
