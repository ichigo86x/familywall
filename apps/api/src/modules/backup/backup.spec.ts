import { describe, expect, it } from "vitest";
import { encryptBackup } from "../../common/crypto/backup-cipher";
import { SettingsRepository } from "../settings/settings.repository";
import { RemoteBackupService } from "./remote-backup.service";
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
  db.prepare("UPDATE members SET totp_enabled = 1, totp_secret_enc = ?, totp_recovery = '[\"h\"]' WHERE id = 'm1'").run(box.encrypt("JBSWY3DPEHPK3PXP"));
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

    expect(summary).toEqual({ members: 1, lists: 1, credentials: "re-encrypted", totpReset: 0 });
    // The two-step secret is re-encrypted with the new key, so the codes keep working.
    const { totp_secret_enc: totp } = target.prepare("SELECT totp_secret_enc FROM members").get() as { totp_secret_enc: string };
    expect(targetBox.decrypt(totp)).toBe("JBSWY3DPEHPK3PXP");
    expect(target.prepare("SELECT title FROM notes").all()).toEqual([{ title: "Wifi" }]);
    const { secret_enc: secret } = target.prepare("SELECT secret_enc FROM provider_accounts").get() as { secret_enc: string };
    expect(targetBox.decrypt(secret)).toBe("app-password");
    expect(readFileSync(path.join(targetDir, "radicale", "collections", "collection-root", "famiglia", "spesa", "latte.ics"), "utf8")).toContain("VCALENDAR");
  });

  it("turns off two-step sign-in when the backup has no key, instead of locking the member out", () => {
    const source = seed(mkdtempSync(path.join(tmpdir(), "fw-src-")), randomBytes(32));
    const packed = source.service.create({ includeKey: false });
    const targetDir = mkdtempSync(path.join(tmpdir(), "fw-dst-"));
    const target = openDatabase(path.join(targetDir, "familywall.db"));
    const summary = new BackupService(target, new SecretBox(randomBytes(32)), targetDir).restore(packed);

    expect(summary).toMatchObject({ credentials: "unreadable", totpReset: 1 });
    expect(target.prepare("SELECT totp_enabled, totp_secret_enc, totp_recovery FROM members").get()).toEqual({ totp_enabled: 0, totp_secret_enc: null, totp_recovery: "[]" });
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

  it("restores an encrypted remote copy only with its passphrase", () => {
    const source = seed(mkdtempSync(path.join(tmpdir(), "fw-src-")), randomBytes(32));
    const encrypted = encryptBackup(source.service.create({ includeKey: true }), "una frase lunga e segreta");
    const targetDir = mkdtempSync(path.join(tmpdir(), "fw-dst-"));
    const target = new BackupService(openDatabase(path.join(targetDir, "familywall.db")), new SecretBox(randomBytes(32)), targetDir);

    expect(() => target.restore(encrypted)).toThrow(/cifrato/);
    expect(() => target.restore(encrypted, "sbagliata")).toThrow(/non corretta/);
    expect(target.restore(encrypted, "una frase lunga e segreta")).toMatchObject({ credentials: "re-encrypted", totpReset: 0 });
  });

  it("uploads an encrypted daily copy to a WebDAV folder and keeps only the latest ones", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "fw-"));
    const { db, service } = seed(dataDir, randomBytes(32));
    const files = new Map<string, Buffer>([
      ["familywall-2026-10-01.fwbackup.enc", Buffer.from("old")],
      ["familywall-2026-10-02.fwbackup.enc", Buffer.from("old")],
      ["altro.txt", Buffer.from("keep")]
    ]);
    const requests: string[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      requests.push(`${init.method} ${url}`);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("mario:dav-password").toString("base64")}`);
      const name = decodeURIComponent(url.split("/").pop() ?? "");
      if (init.method === "PUT") {
        files.set(name, Buffer.from(init.body as Buffer));
        return new Response(null, { status: 201 });
      }
      if (init.method === "DELETE") {
        files.delete(name);
        return new Response(null, { status: 204 });
      }
      const xml = [...files.keys()].map((file) => `<d:response><d:href>/dav/Familywall/${file}</d:href></d:response>`).join("");
      return new Response(`<d:multistatus xmlns:d="DAV:">${xml}</d:multistatus>`, { status: 207 });
    };
    const settings = new SettingsRepository(db);
    const box = new SecretBox(randomBytes(32));
    const remote = new RemoteBackupService(service, settings, box, fetchImpl, () => new Date("2026-10-13T03:00:00Z"));

    remote.update({ enabled: true, url: "https://nas.example/dav/Familywall", username: "mario", keep: 2, password: "dav-password", passphrase: "una frase lunga e segreta" });
    expect(JSON.stringify(settings.get())).not.toContain("nas.example");
    const status = await remote.run(true);

    expect(status).toMatchObject({ lastSuccess: "2026-10-13T03:00:00.000Z", lastError: null, passwordSet: true, passphraseSet: true });
    expect(requests[0]).toBe("PUT https://nas.example/dav/Familywall/familywall-2026-10-13.fwbackup.enc");
    expect([...files.keys()].sort()).toEqual(["altro.txt", "familywall-2026-10-02.fwbackup.enc", "familywall-2026-10-13.fwbackup.enc"]);
    expect(files.get("familywall-2026-10-13.fwbackup.enc")!.subarray(0, 6).toString()).toBe("FWENC1");
  });
});
