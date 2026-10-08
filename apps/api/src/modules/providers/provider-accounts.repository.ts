import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CalendarProvider, ConnectionStatus, ProviderAccount } from "@familywall/shared";
import { SECRET_BOX, SecretBox } from "../../common/crypto/secret-box";
import { DATABASE, nowIso, type Database } from "../../database/database";
import { ICLOUD_CALDAV_URL, type CalDavCredentials } from "./caldav/caldav-client";

interface AccountRow {
  id: string;
  provider: CalendarProvider;
  label: string;
  username: string;
  secret_enc: string;
  server_url: string | null;
  status: ConnectionStatus;
  last_error: string | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface NewAccount {
  provider: CalendarProvider;
  label: string;
  username: string;
  password: string;
  serverUrl: string | null;
}

/** Secrets are encrypted on write and only decrypted when building server-side credentials. */
const toAccount = (row: AccountRow): ProviderAccount => ({
  id: row.id,
  provider: row.provider,
  label: row.label,
  username: row.username,
  serverUrl: row.server_url,
  status: row.status,
  lastError: row.last_error,
  lastCheckedAt: row.last_checked_at,
  createdAt: row.created_at
});

@Injectable()
export class ProviderAccountsRepository {
  public constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly secrets: SecretBox
  ) {}

  public list(): ProviderAccount[] {
    return (this.db.prepare("SELECT * FROM provider_accounts ORDER BY created_at").all() as unknown as AccountRow[]).map(toAccount);
  }

  public findById(id: string): ProviderAccount | undefined {
    const row = this.row(id);
    return row ? toAccount(row) : undefined;
  }

  public credentials(id: string): CalDavCredentials | undefined {
    const row = this.row(id);
    if (!row) {
      return undefined;
    }

    let password: string;
    try {
      password = this.secrets.decrypt(row.secret_enc);
    } catch {
      // Happens when secret.key was lost or replaced after the account was saved.
      throw new Error("Le credenziali salvate non sono leggibili: scollega e ricollega l'account.");
    }

    return {
      serverUrl: row.provider === "icloud" ? ICLOUD_CALDAV_URL : row.server_url!,
      username: row.username,
      password
    };
  }

  public insert(account: NewAccount): ProviderAccount {
    const id = randomUUID();
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO provider_accounts (id, provider, label, username, secret_enc, server_url, status, last_checked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ok', ?, ?)`
      )
      .run(id, account.provider, account.label, account.username, this.secrets.encrypt(account.password), account.serverUrl, now, now);
    return this.findById(id)!;
  }

  public recordCheck(id: string, error: string | null): void {
    this.db
      .prepare("UPDATE provider_accounts SET status = ?, last_error = ?, last_checked_at = ? WHERE id = ?")
      .run(error ? "error" : "ok", error, nowIso(), id);
  }

  public recordStatus(id: string, status: ConnectionStatus, error: string | null): void {
    this.db.prepare("UPDATE provider_accounts SET status = ?, last_error = ?, last_checked_at = ? WHERE id = ?").run(status, error, nowIso(), id);
  }

  public delete(id: string): void {
    this.db.prepare("DELETE FROM provider_accounts WHERE id = ?").run(id);
  }

  private row(id: string): AccountRow | undefined {
    return this.db.prepare("SELECT * FROM provider_accounts WHERE id = ?").get(id) as AccountRow | undefined;
  }
}
