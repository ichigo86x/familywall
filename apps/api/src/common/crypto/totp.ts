import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Codes of authenticator apps (RFC 6238): HMAC-SHA1, 30-second steps, 6 digits. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (bytes: Buffer): string => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
};

export const base32Decode = (text: string): Buffer => {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};

/** A new 160-bit secret, base32 as authenticator apps expect it. */
export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export const totpStep = (time: number): number => Math.floor(time / 1000 / STEP_SECONDS);

export const totpCode = (secret: string, step: number): string => {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 15;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(binary).padStart(DIGITS, "0");
};

/**
 * The step a code belongs to, accepting one step of clock drift either way; null when wrong.
 * Callers refuse a step already used, so a code cannot be replayed.
 */
export const matchTotp = (secret: string, code: string, time: number): number | null => {
  const now = totpStep(time);
  for (const step of [now, now - 1, now + 1]) {
    const expected = Buffer.from(totpCode(secret, step));
    const given = Buffer.from(code.padEnd(DIGITS, " ").slice(0, DIGITS));
    if (code.length === DIGITS && timingSafeEqual(expected, given)) {
      return step;
    }
  }
  return null;
};

export const otpauthUrl = (secret: string, account: string, issuer: string): string =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

/** Recovery codes ("abcd-efgh"), shown once and stored hashed. */
export const generateRecoveryCodes = (count = 8): string[] =>
  Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });

export const hashRecoveryCode = (code: string): string => createHash("sha256").update(code.toLowerCase().replace(/-/g, "")).digest("hex");
