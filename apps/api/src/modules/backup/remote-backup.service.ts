import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { DEFAULT_REMOTE_BACKUP, type RemoteBackupInput, type RemoteBackupSettings, type RemoteBackupStatus } from "@familywall/shared";
import { encryptBackup } from "../../common/crypto/backup-cipher";
import type { SecretBox } from "../../common/crypto/secret-box";
import { AppException } from "../../common/errors/app-exception";
import { responseBlocks, tagContent, unescapeXml } from "../providers/caldav/caldav-client";
import { SettingsRepository } from "../settings/settings.repository";
import { BackupService } from "./backup.service";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const CHECK_MS = 3 * 60 * 60 * 1000;
const REMOTE_NAME = /^familywall-\d{4}-\d{2}-\d{2}\.fwbackup\.enc$/;
const KEYS = { settings: "remoteBackup", password: "remoteBackupPassword", passphrase: "remoteBackupPassphrase", last: "remoteBackupLast" } as const;

const LIST_BODY = `<?xml version="1.0" encoding="UTF-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`;

/**
 * A copy of the daily backup on a WebDAV folder outside the house (Nextcloud, Synology, QNAP...).
 * The copy includes the credentials key and is encrypted with a passphrase that only the Admin knows:
 * with it and the file, everything can be restored on a new installation.
 * Its settings stay on the server (never in the settings sent to the members); passwords are encrypted.
 */
@Injectable()
export class RemoteBackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("RemoteBackup");
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<RemoteBackupStatus> | null = null;

  public constructor(
    private readonly backup: BackupService,
    private readonly settings: SettingsRepository,
    private readonly secrets: SecretBox,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date()
  ) {}

  private config(): RemoteBackupSettings {
    const stored = this.settings.secret(KEYS.settings);
    return stored ? { ...DEFAULT_REMOTE_BACKUP, ...(JSON.parse(stored) as Partial<RemoteBackupSettings>) } : DEFAULT_REMOTE_BACKUP;
  }

  private decrypted(key: string): string | null {
    const stored = this.settings.secret(key);
    try {
      return stored ? this.secrets.decrypt(stored) : null;
    } catch {
      return null;
    }
  }

  public status(): RemoteBackupStatus {
    const last = this.settings.secret(KEYS.last);
    const parsed = last ? (JSON.parse(last) as { success: string | null; error: string | null }) : { success: null, error: null };
    return {
      settings: this.config(),
      passwordSet: this.settings.secret(KEYS.password) !== null,
      passphraseSet: this.settings.secret(KEYS.passphrase) !== null,
      lastSuccess: parsed.success,
      lastError: parsed.error
    };
  }

  public update(input: RemoteBackupInput): RemoteBackupStatus {
    if (input.enabled && (!input.url || (!input.passphrase && this.settings.secret(KEYS.passphrase) === null))) {
      throw AppException.validation("Per attivare la copia remota servono l'indirizzo della cartella e la frase segreta.");
    }
    const settings: RemoteBackupSettings = { enabled: input.enabled, url: input.url, username: input.username, keep: input.keep };
    this.settings.setSecret(KEYS.settings, JSON.stringify(settings));
    if (input.password !== undefined) {
      this.settings.setSecret(KEYS.password, input.password ? this.secrets.encrypt(input.password) : null);
    }
    if (input.passphrase) {
      this.settings.setSecret(KEYS.passphrase, this.secrets.encrypt(input.passphrase));
    }
    return this.status();
  }

  /** Uploads today's copy (once a day unless forced) and deletes the copies beyond the ones to keep. */
  public run(force = false): Promise<RemoteBackupStatus> {
    this.running ??= this.upload(force).finally(() => (this.running = null));
    return this.running;
  }

  private async upload(force: boolean): Promise<RemoteBackupStatus> {
    const config = this.config();
    const today = this.now().toISOString().slice(0, 10);
    if (!config.enabled || !config.url) {
      if (force) {
        throw AppException.validation("La copia remota non è attiva.");
      }
      return this.status();
    }
    if (!force && this.status().lastSuccess?.startsWith(today)) {
      return this.status();
    }
    const passphrase = this.decrypted(KEYS.passphrase);
    try {
      if (!passphrase) {
        throw new Error("frase segreta mancante o non leggibile: inseriscila di nuovo.");
      }
      const folder = config.url.endsWith("/") ? config.url : `${config.url}/`;
      const name = `familywall-${today}.fwbackup.enc`;
      const body = encryptBackup(this.backup.create({ includeKey: true }), passphrase);
      let response = await this.send(config, `${folder}${name}`, "PUT", body, { "Content-Type": "application/octet-stream" });
      if (response.status === 404 || response.status === 409) {
        // The folder does not exist yet.
        await this.send(config, folder, "MKCOL");
        response = await this.send(config, `${folder}${name}`, "PUT", body, { "Content-Type": "application/octet-stream" });
      }
      if (!response.ok) {
        throw new Error(response.status === 401 || response.status === 403 ? "utente o password rifiutati dal server." : `il server ha risposto HTTP ${response.status}.`);
      }
      await this.prune(config, folder);
      this.record(this.now().toISOString(), null);
      this.logger.log(`Remote backup uploaded: ${name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record(this.status().lastSuccess, `${this.now().toISOString().slice(0, 16).replace("T", " ")}: ${message}`);
      this.logger.warn(`Remote backup failed: ${message}`);
      if (force) {
        throw AppException.providerError(`Copia remota non riuscita: ${message}`);
      }
    }
    return this.status();
  }

  private async prune(config: RemoteBackupSettings, folder: string): Promise<void> {
    const response = await this.send(config, folder, "PROPFIND", LIST_BODY, { Depth: "1", "Content-Type": "application/xml; charset=utf-8" });
    if (!response.ok) {
      return;
    }
    const names = responseBlocks(await response.text())
      .map((block) => decodeURIComponent(unescapeXml(tagContent(block, "href") ?? "").replace(/\/+$/, "").split("/").pop() ?? ""))
      .filter((name) => REMOTE_NAME.test(name))
      .sort()
      .reverse();
    for (const old of names.slice(config.keep)) {
      await this.send(config, `${folder}${encodeURIComponent(old)}`, "DELETE");
    }
  }

  private record(success: string | null, error: string | null): void {
    this.settings.setSecret(KEYS.last, JSON.stringify({ success, error }));
  }

  private async send(config: RemoteBackupSettings, url: string, method: string, body?: Buffer | string, headers: Record<string, string> = {}): Promise<Response> {
    const password = this.decrypted(KEYS.password) ?? "";
    const auth = config.username ? { Authorization: `Basic ${Buffer.from(`${config.username}:${password}`).toString("base64")}` } : {};
    try {
      const response = await this.fetchImpl(url, { method, body, headers: { ...auth, ...headers }, signal: AbortSignal.timeout(120_000) });
      if (method !== "PROPFIND") {
        await response.arrayBuffer().catch(() => undefined);
      }
      return response;
    } catch (error) {
      throw new Error(`server non raggiungibile (${error instanceof Error ? error.message : String(error)}).`);
    }
  }

  public onModuleInit(): void {
    if (process.env.VITEST) {
      return;
    }
    const tick = () => void this.run().catch(() => undefined);
    setTimeout(tick, 5 * 60_000);
    this.timer = setInterval(tick, CHECK_MS);
  }

  public onModuleDestroy(): void {
    clearInterval(this.timer);
  }
}

