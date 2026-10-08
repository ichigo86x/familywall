import { describe, expect, it } from "vitest";
import { hashPassword } from "../../common/crypto/password";
import { base32Encode, totpCode, totpStep } from "../../common/crypto/totp";
import { createTestContext } from "../../test/test-context";
import { auditAction } from "../audit/audit-labels";

describe("TOTP", () => {
  it("matches the RFC 6238 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpCode(secret, totpStep(59_000))).toBe("287082");
    expect(totpCode(secret, totpStep(1_111_111_109_000))).toBe("081804");
  });

  it("asks a code at sign-in once turned on, refuses replays and accepts a recovery code once", async () => {
    const ctx = createTestContext();
    const member = ctx.membersRepository.insert({ username: "mario", displayName: "Mario", role: "Admin", color: "#2563EB", passwordHash: await hashPassword("very-long-password") });
    const { secret } = ctx.totp.setup(member.id);
    const now = Date.now();
    const { recoveryCodes } = ctx.totp.enable(member.id, totpCode(secret, totpStep(now)), now);
    expect(recoveryCodes).toHaveLength(8);

    await expect(ctx.auth.login({ username: "mario", password: "very-long-password" }, "ip")).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
    // The code used to turn it on cannot be used again.
    await expect(ctx.auth.login({ username: "mario", password: "very-long-password", code: totpCode(secret, totpStep(now)) }, "ip")).rejects.toMatchObject({
      code: "TOTP_REQUIRED"
    });
    const next = totpCode(secret, totpStep(now) + 1);
    expect((await ctx.auth.login({ username: "mario", password: "very-long-password", code: next }, "ip")).user.totpEnabled).toBe(true);

    expect((await ctx.auth.login({ username: "mario", password: "very-long-password", code: recoveryCodes[0]! }, "ip2")).token).toBeTruthy();
    await expect(ctx.auth.login({ username: "mario", password: "very-long-password", code: recoveryCodes[0]! }, "ip3")).rejects.toMatchObject({ code: "TOTP_REQUIRED" });

    await ctx.totp.disable(member.id, "very-long-password", recoveryCodes[1]!);
    expect((await ctx.auth.login({ username: "mario", password: "very-long-password" }, "ip4")).user.totpEnabled).toBe(false);
  });
});

describe("activity log labels", () => {
  it("names the changes in Italian", () => {
    expect(auditAction("PATCH", "/members/:memberId")).toBe("Membri: modifica");
    expect(auditAction("POST", "/backup/restore")).toBe("Backup: ripristino");
    expect(auditAction("DELETE", "/notes/:noteId")).toBe("Note: eliminazione");
  });
});
