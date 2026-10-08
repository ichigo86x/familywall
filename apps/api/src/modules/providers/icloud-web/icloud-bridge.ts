import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { appConfig } from "../../../config/app-config";

/** The Python side lives next to the API sources (apps/api/python), the same depth from src and dist. */
const SCRIPT = path.resolve(__dirname, "..", "..", "..", "..", "python", "icloud_bridge.py");
const START_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 60_000;

export class IcloudBridgeError extends Error {
  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export interface IcloudCredentials {
  appleId: string;
  password: string;
}

export interface IcloudList {
  id: string;
  title: string;
  color: string | null;
}

export interface IcloudReminder {
  id: string;
  title: string;
  desc: string;
  completed: boolean;
  completed_date: string | null;
  due_date: string | null;
  parent: string | null;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Apple Reminders through pyicloud, the library of Home Assistant's iCloud integration: Familywall
 * starts a small Python process on localhost the first time an iCloud Reminders account is used and
 * talks to it with a random token. A session closed by Apple is opened again with the stored Apple ID
 * and password; a new two-factor code is asked only when Apple wants one.
 */
@Injectable()
export class IcloudBridge implements OnApplicationShutdown {
  private readonly logger = new Logger("iCloud");
  private readonly token = randomBytes(24).toString("hex");
  private child: ChildProcess | null = null;
  private starting: Promise<void> | null = null;

  public constructor(
    private readonly options: { python: string; port: number; sessionDir: string; script?: string } = {
      python: appConfig.icloudPython,
      port: appConfig.icloudBridgePort,
      sessionDir: path.join(appConfig.dataDir, "icloud")
    },
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init)
  ) {}

  public get enabled(): boolean {
    return this.options.python.trim() !== "";
  }

  public onApplicationShutdown(): void {
    this.child?.kill();
    this.child = null;
  }

  /** Opens the session: "2fa" when Apple wants the code sent to the trusted devices. */
  public login(account: string, credentials: IcloudCredentials): Promise<{ status: "ok" | "2fa" }> {
    return this.call("/login", { account, apple_id: credentials.appleId, password: credentials.password });
  }

  public verify(account: string, code: string): Promise<{ status: "ok" }> {
    return this.call("/verify", { account, code });
  }

  public requestCode(account: string): Promise<{ status: "sent" }> {
    return this.call("/request-code", { account });
  }

  public forget(account: string): Promise<unknown> {
    return this.child ? this.call("/forget", { account }).catch(() => undefined) : Promise.resolve();
  }

  public lists(account: string, credentials: () => IcloudCredentials): Promise<IcloudList[]> {
    return this.withSession(account, credentials, () => this.call("/lists", { account }));
  }

  public reminders(account: string, credentials: () => IcloudCredentials, listId: string): Promise<IcloudReminder[]> {
    return this.withSession(account, credentials, () => this.call("/reminders", { account, list_id: listId }));
  }

  public create(account: string, credentials: () => IcloudCredentials, listId: string, title: string): Promise<IcloudReminder> {
    return this.withSession(account, credentials, () => this.call("/create", { account, list_id: listId, title }));
  }

  public update(account: string, credentials: () => IcloudCredentials, id: string, patch: { title?: string; completed?: boolean }): Promise<IcloudReminder> {
    return this.withSession(account, credentials, () => this.call("/update", { account, id, ...patch }));
  }

  public delete(account: string, credentials: () => IcloudCredentials, id: string): Promise<unknown> {
    return this.withSession(account, credentials, () => this.call("/delete", { account, id }));
  }

  /** The bridge forgets sessions when it restarts: the session is opened again once, then the call is repeated. */
  private async withSession<T>(account: string, credentials: () => IcloudCredentials, action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof IcloudBridgeError) || error.code !== "auth_required") {
        throw error;
      }
      const { status } = await this.login(account, credentials());
      if (status === "2fa") {
        throw new IcloudBridgeError("2fa_required", "iCloud chiede il codice di verifica: Admin → Account collegati → Verifica.");
      }
      return action();
    }
  }

  private async call<T>(route: string, body: Record<string, unknown>): Promise<T> {
    await this.start();
    let response: Response;
    try {
      response = await this.fetchImpl(`http://127.0.0.1:${this.options.port}${route}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Token": this.token },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS)
      });
    } catch (error) {
      throw new IcloudBridgeError("unreachable", `Collegamento iCloud non disponibile: ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
    if (!response.ok) {
      throw new IcloudBridgeError(payload.error ?? "icloud_error", payload.message ?? `iCloud: HTTP ${response.status}`);
    }
    return payload as T;
  }

  private start(): Promise<void> {
    if (this.child) {
      return Promise.resolve();
    }
    if (!this.enabled) {
      return Promise.reject(new IcloudBridgeError("disabled", "Promemoria iCloud non attivi (ICLOUD_PYTHON è vuoto)."));
    }
    this.starting ??= this.launch().finally(() => (this.starting = null));
    return this.starting;
  }

  private async launch(): Promise<void> {
    const script = this.options.script ?? SCRIPT;
    if (!existsSync(script)) {
      throw new IcloudBridgeError("disabled", "Script del collegamento iCloud mancante.");
    }
    // A path to an existing interpreter may contain spaces; otherwise the setting is a command line ("py -3").
    const python = this.options.python.trim();
    const [executable, ...args] = existsSync(python) ? [python] : python.split(/\s+/);
    const child = spawn(executable!, [...args, script], {
      env: { ...process.env, ICLOUD_BRIDGE_TOKEN: this.token, ICLOUD_BRIDGE_PORT: String(this.options.port), ICLOUD_SESSION_DIR: this.options.sessionDir, PYTHONUNBUFFERED: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let failure = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      failure = text.slice(-500);
      this.logger.warn(text.slice(0, 500));
    });
    child.on("exit", (code) => {
      if (this.child === child) {
        this.child = null;
        this.logger.warn(`iCloud bridge exited (code ${code}); it starts again at the next use.`);
      }
    });
    const spawned = await new Promise<boolean>((resolve) => {
      child.once("spawn", () => resolve(true));
      child.once("error", () => resolve(false));
    });
    if (!spawned) {
      throw new IcloudBridgeError("disabled", `Python non trovato (${executable}): installa Python 3, poi esegui "npm run icloud:setup" e riavvia l'API (oppure imposta ICLOUD_PYTHON).`);
    }
    this.child = child;

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        this.child = null;
        throw new IcloudBridgeError(
          "disabled",
          /No module named .?pyicloud/.test(failure) ? `pyicloud non installato per ${executable}. Nell'add-on è già incluso; in sviluppo esegui "npm run icloud:setup" e riavvia l'API.` : `Collegamento iCloud non avviato: ${failure || "errore sconosciuto"}`
        );
      }
      const healthy = await this.fetchImpl(`http://127.0.0.1:${this.options.port}/health`, { method: "GET", signal: AbortSignal.timeout(1_000) })
        .then((response) => response.ok)
        .catch(() => false);
      if (healthy) {
        this.logger.log(`iCloud bridge ready on 127.0.0.1:${this.options.port}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    child.kill();
    this.child = null;
    throw new IcloudBridgeError("unreachable", "Il collegamento iCloud non si è avviato in tempo.");
  }
}
