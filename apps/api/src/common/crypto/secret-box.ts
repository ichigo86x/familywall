import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const SECRET_BOX = Symbol("SECRET_BOX");

/** AES-256-GCM wrapper for provider credentials stored at rest. */
export class SecretBox {
  public constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error("SecretBox key must be 32 bytes.");
    }
  }

  public encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
  }

  public decrypt(payload: string): string {
    const [version, iv, tag, ciphertext] = payload.split(":");
    if (version !== "v1" || !iv || !tag || !ciphertext) {
      throw new Error("Unsupported secret format.");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  }
}
