import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Returns a 32-byte key from the environment (base64) or from a file in the data
 * directory, generating the file on first run so the add-on needs no manual setup.
 */
export const loadOrCreateKey = (dataDir: string, fileName: string, envVar: string): Buffer => {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) {
      throw new Error(`${envVar} must be 32 bytes encoded as base64.`);
    }
    return key;
  }

  const keyPath = path.join(dataDir, fileName);
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf8").trim(), "base64");
  }

  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString("base64"), { mode: 0o600 });
  return key;
};
