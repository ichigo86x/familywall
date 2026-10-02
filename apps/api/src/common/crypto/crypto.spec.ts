import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { SecretBox } from "./secret-box";

describe("SecretBox", () => {
  it("round-trips and never stores plaintext", () => {
    const box = new SecretBox(randomBytes(32));
    const encrypted = box.encrypt("abcd-efgh-ijkl-mnop");

    expect(encrypted).not.toContain("abcd");
    expect(box.decrypt(encrypted)).toBe("abcd-efgh-ijkl-mnop");
  });

  it("rejects tampered ciphertext and foreign keys", () => {
    const box = new SecretBox(randomBytes(32));
    const parts = box.encrypt("secret").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");

    expect(() => box.decrypt(parts.join(":"))).toThrow();
    expect(() => new SecretBox(randomBytes(32)).decrypt(box.encrypt("secret"))).toThrow();
  });
});

describe("password hashing", () => {
  it("salts every hash and verifies only the right password", async () => {
    const first = await hashPassword("correct horse");
    const second = await hashPassword("correct horse");

    expect(first).not.toBe(second);
    await expect(verifyPassword("correct horse", first)).resolves.toBe(true);
    await expect(verifyPassword("wrong horse", first)).resolves.toBe(false);
    await expect(verifyPassword("correct horse", "garbage")).resolves.toBe(false);
  });
});
