import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import { SECRET_BOX, SecretBox } from "../../common/crypto/secret-box";
import { AppException } from "../../common/errors/app-exception";
import { DATABASE, openDatabase, transaction, type Database } from "../../database/database";

const FORMAT = "familywall-backup";
const KEEP_DAILY = 7;
const DAILY_CHECK_MS = 60 * 60 * 1000;
const MAX_UNPACKED_BYTES = 300 * 1024 * 1024;
/** Derived data, rebuilt by the next sync: never restored. */
const SKIPPED_TABLES = new Set(["calendar_cache"]);
const STORED_NAME = /^familywall-\d{4}-\d{2}-\d{2}\.fwbackup$/;

interface BackupBundle {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  schemaVersion: number;
  /** SQLite snapshot, base64. */
  database: string;
  /** Files of the built-in CalDAV server (family lists), paths relative to radicale/collections. */
  files: Array<{ path: string; data: string }>;
  /** secret.key (base64) when the Admin chose to include it: without it provider credentials must be entered again. */
  secretKey: string | null;
}

export interface RestoreSummary {
  members: number;
  lists: number;
  credentials: "kept" | "re-encrypted" | "unreadable";
}

export interface StoredBackup {
  name: string;
  size: number;
  createdAt: string;
}

const walk = (root: string, base = root): string[] =>
  existsSync(root)
    ? readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(root, entry.name);
        return entry.isDirectory() ? walk(full, base) : [path.relative(base, full).split(path.sep).join("/")];
      })
    : [];

const quoteIdentifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Backups of everything Familywall keeps (members, settings, local events, shifts, notes,
 * occasions, Google/iCloud links and the family lists of the CalDAV server). A daily copy is
 * kept in DATA_DIR/backups; the Admin can download one and restore it in place.
 */
@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  public constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly secrets: SecretBox,
    private readonly dataDir: string
  ) {}

  private get collectionsDir(): string {
    return path.join(this.dataDir, "radicale", "collections");
  }

  private get storedDir(): string {
    return path.join(this.dataDir, "backups");
  }

  public create(options: { includeKey: boolean }): Buffer {
    mkdirSync(this.dataDir, { recursive: true });
    const snapshot = path.join(this.dataDir, `backup-${randomBytes(6).toString("hex")}.db`);
    try {
      // A consistent copy even while the app is writing.
      this.db.exec(`VACUUM INTO ${quoteLiteral(snapshot)}`);
      const { user_version: schemaVersion } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
      const bundle: BackupBundle = {
        format: FORMAT,
        version: 1,
        createdAt: new Date().toISOString(),
        schemaVersion,
        database: readFileSync(snapshot).toString("base64"),
        files: walk(this.collectionsDir).map((file) => ({ path: file, data: readFileSync(path.join(this.collectionsDir, file)).toString("base64") })),
        secretKey: options.includeKey ? this.secretKey()?.toString("base64") ?? null : null
      };
      return gzipSync(JSON.stringify(bundle));
    } finally {
      rmSync(snapshot, { force: true });
    }
  }

  public restore(packed: Buffer): RestoreSummary {
    const bundle = this.unpack(packed);
    const staged = path.join(this.dataDir, `restore-${randomBytes(6).toString("hex")}.db`);
    writeFileSync(staged, Buffer.from(bundle.database, "base64"));
    try {
      // Opening runs the migrations: a backup from an older version gets the current schema.
      const check = openDatabase(staged);
      try {
        const { integrity_check: integrity } = check.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
        const { admins } = check.prepare("SELECT COUNT(*) AS admins FROM members WHERE role = 'Admin' AND disabled = 0").get() as { admins: number };
        if (integrity !== "ok" || admins === 0) {
          throw AppException.validation("Il backup è danneggiato o non contiene un Admin attivo.");
        }
      } finally {
        check.close();
      }

      const credentials = this.reencryptCredentials(staged, bundle.secretKey);
      const members = this.copyInto(staged);
      const lists = this.restoreFiles(bundle.files);
      this.logger.log(`Backup of ${bundle.createdAt} restored (${members} members, ${lists} list files, credentials ${credentials}).`);
      return { members, lists, credentials };
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(staged + suffix, { force: true });
      }
    }
  }

  public listStored(): StoredBackup[] {
    if (!existsSync(this.storedDir)) {
      return [];
    }
    return readdirSync(this.storedDir)
      .filter((name) => STORED_NAME.test(name))
      .map((name) => {
        const stat = statSync(path.join(this.storedDir, name));
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((left, right) => right.name.localeCompare(left.name));
  }

  public readStored(name: string): Buffer {
    if (!STORED_NAME.test(name) || !existsSync(path.join(this.storedDir, name))) {
      throw AppException.notFound("Backup non trovato.");
    }
    return readFileSync(path.join(this.storedDir, name));
  }

  /** One backup per day in DATA_DIR/backups (without the key, which already sits in DATA_DIR); the last 7 are kept. */
  public runDaily(now = new Date()): void {
    const name = `familywall-${now.toISOString().slice(0, 10)}.fwbackup`;
    mkdirSync(this.storedDir, { recursive: true });
    if (!existsSync(path.join(this.storedDir, name))) {
      writeFileSync(path.join(this.storedDir, name), this.create({ includeKey: false }));
      this.logger.log(`Daily backup written: ${name}`);
    }
    for (const old of this.listStored().slice(KEEP_DAILY)) {
      rmSync(path.join(this.storedDir, old.name), { force: true });
    }
  }

  public onModuleInit(): void {
    if (process.env.VITEST) {
      return;
    }
    const run = () => {
      try {
        this.runDaily();
      } catch (error) {
        this.logger.warn(`Daily backup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    setTimeout(run, 60_000);
    this.timer = setInterval(run, DAILY_CHECK_MS);
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private unpack(packed: Buffer): BackupBundle {
    let bundle: Partial<BackupBundle>;
    try {
      bundle = JSON.parse(gunzipSync(packed, { maxOutputLength: MAX_UNPACKED_BYTES }).toString("utf8")) as Partial<BackupBundle>;
    } catch {
      throw AppException.validation("Il file non è un backup di Familywall.");
    }
    if (bundle.format !== FORMAT || bundle.version !== 1 || typeof bundle.database !== "string" || !Array.isArray(bundle.files)) {
      throw AppException.validation("Il file non è un backup di Familywall.");
    }
    if (!Buffer.from(bundle.database.slice(0, 24), "base64").toString("latin1").startsWith("SQLite format 3")) {
      throw AppException.validation("Il backup non contiene un database valido.");
    }
    return bundle as BackupBundle;
  }

  private secretKey(): Buffer | null {
    if (process.env.FAMILYWALL_SECRET_KEY) {
      return Buffer.from(process.env.FAMILYWALL_SECRET_KEY, "base64");
    }
    const file = path.join(this.dataDir, "secret.key");
    return existsSync(file) ? Buffer.from(readFileSync(file, "utf8").trim(), "base64") : null;
  }

  /** Provider credentials are encrypted with the key of the installation that made the backup. */
  private reencryptCredentials(staged: string, backupKey: string | null): RestoreSummary["credentials"] {
    const db = new DatabaseSync(staged);
    try {
      const rows = db.prepare("SELECT id, secret_enc FROM provider_accounts").all() as Array<{ id: string; secret_enc: string }>;
      const readable = (box: SecretBox, value: string) => {
        try {
          return box.decrypt(value);
        } catch {
          return null;
        }
      };
      if (rows.every((row) => readable(this.secrets, row.secret_enc) !== null)) {
        return "kept";
      }
      const key = backupKey ? Buffer.from(backupKey, "base64") : null;
      if (!key || key.length !== 32) {
        return "unreadable";
      }
      const backupBox = new SecretBox(key);
      const update = db.prepare("UPDATE provider_accounts SET secret_enc = ? WHERE id = ?");
      let unreadable = false;
      for (const row of rows) {
        const plain = readable(this.secrets, row.secret_enc) ?? readable(backupBox, row.secret_enc);
        if (plain === null) {
          unreadable = true;
          continue;
        }
        update.run(this.secrets.encrypt(plain), row.id);
      }
      return unreadable ? "unreadable" : "re-encrypted";
    } finally {
      db.close();
    }
  }

  /** Replaces every table of the live database with the backup's rows, in one transaction. */
  private copyInto(staged: string): number {
    const tables = (this.db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>).map(
      (row) => row.name
    );
    this.db.exec("PRAGMA foreign_keys = OFF");
    this.db.exec(`ATTACH DATABASE ${quoteLiteral(staged)} AS backup`);
    try {
      const backupTables = new Set(
        (this.db.prepare("SELECT name FROM backup.sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)
      );
      transaction(this.db, () => {
        for (const table of tables) {
          this.db.exec(`DELETE FROM main.${quoteIdentifier(table)}`);
          if (SKIPPED_TABLES.has(table) || !backupTables.has(table)) {
            continue;
          }
          const columnsOf = (schema: string) =>
            (this.db.prepare(`PRAGMA ${schema}.table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((column) => column.name);
          const backupColumns = new Set(columnsOf("backup"));
          const columns = columnsOf("main").filter((column) => backupColumns.has(column)).map(quoteIdentifier).join(", ");
          this.db.exec(`INSERT INTO main.${quoteIdentifier(table)} (${columns}) SELECT ${columns} FROM backup.${quoteIdentifier(table)}`);
        }
        if (this.db.prepare("PRAGMA main.foreign_key_check").all().length > 0) {
          throw AppException.validation("Il backup ha riferimenti non validi tra i dati.");
        }
      });
    } finally {
      this.db.exec("DETACH DATABASE backup");
      this.db.exec("PRAGMA foreign_keys = ON");
    }
    return (this.db.prepare("SELECT COUNT(*) AS total FROM members").get() as { total: number }).total;
  }

  /** Family lists of the CalDAV server: replaced only when the backup has them. */
  private restoreFiles(files: BackupBundle["files"]): number {
    const safe = files.filter((file) => typeof file.path === "string" && typeof file.data === "string" && !file.path.split("/").some((part) => part === ".." || part === "") && !path.isAbsolute(file.path));
    if (safe.length === 0) {
      return 0;
    }
    rmSync(this.collectionsDir, { recursive: true, force: true });
    for (const file of safe) {
      const target = path.join(this.collectionsDir, ...file.path.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(file.data, "base64"));
    }
    return safe.length;
  }
}
