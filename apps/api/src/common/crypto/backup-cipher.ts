import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Backups sent off the house (remote copy) are encrypted with a passphrase chosen by the Admin:
 * "FWENC1" + scrypt salt (16) + AES-256-GCM nonce (12) + tag (16) + ciphertext.
 */
const MAGIC = Buffer.from("FWENC1", "ascii");
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const MIN_PASSPHRASE_LENGTH = 12;

export const isEncryptedBackup = (data: Buffer): boolean => data.length > MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);

const keyOf = (passphrase: string, salt: Buffer): Buffer => scryptSync(passphrase, salt, 32, SCRYPT);

export const encryptBackup = (data: Buffer, passphrase: string): Buffer => {
  const salt = randomBytes(16);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(passphrase, salt), nonce);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, nonce, cipher.getAuthTag(), encrypted]);
};

/** Throws when the passphrase is wrong or the file was changed. */
export const decryptBackup = (data: Buffer, passphrase: string): Buffer => {
  let offset = MAGIC.length;
  const salt = data.subarray(offset, (offset += 16));
  const nonce = data.subarray(offset, (offset += 12));
  const tag = data.subarray(offset, (offset += 16));
  const decipher = createDecipheriv("aes-256-gcm", keyOf(passphrase, salt), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()]);
};
