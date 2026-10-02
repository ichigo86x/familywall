import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations";

export const DATABASE = Symbol("DATABASE");

export type Database = DatabaseSync;

/** Opens (or creates) the SQLite file and brings the schema up to date. Pass ":memory:" in tests. */
export const openDatabase = (filePath: string): Database => {
  if (filePath !== ":memory:") {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
};

const migrate = (db: Database): void => {
  const { user_version: current } = db.prepare("PRAGMA user_version").get() as { user_version: number };

  for (let index = current; index < migrations.length; index += 1) {
    transaction(db, () => {
      db.exec(migrations[index]!);
      db.exec(`PRAGMA user_version = ${index + 1}`);
    });
  }
};

export const transaction = <T>(db: Database, work: () => T): T => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const nowIso = (): string => new Date().toISOString();
