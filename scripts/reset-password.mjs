// Sets a new password for a member directly in the SQLite database, for when nobody can sign in.
// Usage: npm run reset-password -- <username> [--data <data dir>] [--disable-totp]
// The password is asked on the terminal (not echoed). Existing sessions of the member are signed out.
import { randomBytes, scrypt } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const username = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--data");
const dataDir = path.resolve(option("--data") ?? process.env.DATA_DIR ?? path.join(root, "apps", "api", "data"));
const disableTotp = args.includes("--disable-totp");
const file = path.join(dataDir, "familywall.db");

if (!username) {
  console.error("Usage: npm run reset-password -- <username> [--data <data dir>] [--disable-totp]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`Database not found: ${file}`);
  process.exit(1);
}

const db = new DatabaseSync(file);
const member = db.prepare("SELECT id, role FROM members WHERE username = ?").get(username);
if (!member) {
  const names = db.prepare("SELECT username FROM members WHERE password_hash <> '' ORDER BY username").all().map((row) => row.username);
  console.error(`No member "${username}". Members with a password: ${names.join(", ")}`);
  process.exit(1);
}

// One interface for both questions; typed characters are not echoed.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY === true });
let muted = false;
rl._writeToOutput = (text) => {
  if (!muted) rl.output.write(text);
};
const lines = rl[Symbol.asyncIterator]();
const ask = async (question) => {
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write("\n");
  return value ?? "";
};

const password = await ask("New password: ");
if (password.length < 8) {
  console.error("The password must be at least 8 characters.");
  process.exit(1);
}
if ((await ask("Repeat it: ")) !== password) {
  console.error("The passwords do not match.");
  process.exit(1);
}
rl.close();

// Same format as apps/api/src/common/crypto/password.ts.
const salt = randomBytes(16);
const hash = await new Promise((resolve, reject) =>
  scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => (error ? reject(error) : resolve(key)))
);
const stored = ["scrypt", 16384, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$");

db.prepare("UPDATE members SET password_hash = ?, token_version = token_version + 1, disabled = 0, updated_at = ? WHERE id = ?").run(
  stored,
  new Date().toISOString(),
  member.id
);
const columns = db.prepare("PRAGMA table_info(members)").all().map((column) => column.name);
if (disableTotp && columns.includes("totp_enabled")) {
  db.prepare("UPDATE members SET totp_enabled = 0, totp_secret_enc = NULL, totp_pending_enc = NULL, totp_last_step = 0, totp_recovery = '[]' WHERE id = ?").run(member.id);
}
db.close();
console.log(`Password updated for "${username}" (${member.role}).${disableTotp ? " Two-step sign-in turned off." : ""}`);
