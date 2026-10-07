import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SecretBox } from "../../common/crypto/secret-box";
import { openDatabase } from "../../database/database";
import { BackupService } from "./backup.service";

const seed = (dataDir: string, key: Buffer) => {
  const db = openDatabase(path.join(dataDir, "familywall.db"));
  const box = new SecretBox(key);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO members (id, username, display_name, role, color, password_hash, keywords, created_at, updated_at) VALUES ('m1', 'mario', 'Mario', 'Admin', '#000000', 'x', '[]', ?, ?)").run(now, now);
  db.prepare("INSERT INTO provider_accounts (id, provider, label, username, secret_enc, created_at) VALUES ('a1', 'icloud', 'Famiglia', 'f@icloud.com', ?, ?)").run(box.encrypt("app-password"), now);
  db.prepare("INSERT INTO notes (id, title, body, color, created_at, updated_at) VALUES ('n1', 'Wifi', 'sul frigo', '#FFFFFF', ?, ?)").run(now, now);
  writeFileSync(path.join(dataDir, "secret.key"), key.toString("base64"));
  const list = path.join(dataDir, "radicale", "collections", "collection-root", "famiglia", "spesa");
  mkdirSync(list, { recursive: true });
  writeFileSync(path.join(list, "latte.ics"), "BEGIN:VCALENDAR\nEND:VCALENDAR");
  return { db, service: new BackupService(db, box, dataDir) };
};

describe("BackupService", () => {
  it("restores data, lists and credentials into another installation", () => {
    const sourceDir = mkdtempSync(path.join(tmpdir(), "fw-src-"));
    const source = seed(sourceDir, randomBytes(32));
    const packed = source.service.create({ includeKey: true });

    const targetDir = mkdtempSync(path.join(tmpdir(), "fw-dst-"));
    const targetKey = randomBytes(32);
    const target = openDatabase(path.join(targetDir, "familywall.db"));
    const targetBox = new SecretBox(targetKey);
    const summary = new BackupService(target, targetBox, targetDir).restore(packed);

    expect(summary).toEqual({ members: 1, lists: 1, credentials: "re-encrypted" });
    expect(target.prepare("SELECT title FROM notes").all()).toEqual([{ title: "Wifi" }]);
    const { secret_enc: secret } = target.prepare("SELECT secret_enc FROM provider_accounts").get() as { secret_enc: string };
    expect(targetBox.decrypt(secret)).toBe("app-password");
    expect(readFileSync(path.join(targetDir, "radicale", "collections", "collection-root", "famiglia", "spesa", "latte.ics"), "utf8")).toContain("VCALENDAR");
  });

  it("refuses files that are not backups and keeps daily copies", () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "fw-"));
    const { service } = seed(dataDir, randomBytes(32));
    expect(() => service.restore(Buffer.from("not a backup"))).toThrow(/non è un backup/);

    service.runDaily(new Date("2026-10-07T03:00:00Z"));
    service.runDaily(new Date("2026-10-07T04:00:00Z"));
    expect(service.listStored().map((entry) => entry.name)).toEqual(["familywall-2026-10-07.fwbackup"]);
    expect(existsSync(path.join(dataDir, "backups", "familywall-2026-10-07.fwbackup"))).toBe(true);
    // Without the key the credentials of this same installation stay readable.
    expect(service.restore(service.readStored("familywall-2026-10-07.fwbackup")).credentials).toBe("kept");
  });
});
