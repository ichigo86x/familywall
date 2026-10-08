import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ingredientKey } from "@familywall/shared";
import type {
  AddTaskListInput,
  CreateTaskInput,
  FamilyTaskList,
  ListsResponse,
  RemoteTaskList,
  TaskItem,
  TaskListConfig,
  UpdateTaskInput,
  UpdateTaskListInput
} from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { DavGatewayService } from "../dav/dav-gateway.service";
import { DavTasksClient } from "../dav/dav-tasks.client";
import { HomeAssistantClient, HomeAssistantError } from "../home/home-assistant.client";
import { IcloudBridge, IcloudBridgeError, type IcloudReminder } from "../providers/icloud-web/icloud-bridge";
import { GoogleClient, parseGoogleSecret, type GoogleSecret } from "../providers/google/google-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { toAppException } from "../providers/providers.service";
import { SettingsRepository } from "../settings/settings.repository";
import { TaskListsRepository } from "./task-lists.repository";

/** Lists on the built-in CalDAV server have ids "dav:<collection>". */
const DAV_PREFIX = "dav:";
/** Home Assistant to-do lists have ids "ha:<entity id>". */
const HA_PREFIX = "ha:";
/** Home Assistant does not say when an item was completed: the ones ticked here stay visible for two days. */
const COMPLETED_VISIBLE_MS = 2 * 24 * 60 * 60 * 1000;
/** Suggestions look at what was bought in the last months. */
const SUGGESTION_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_SUGGESTIONS = 12;
/** Remote lists (Google, iCloud, Home Assistant) read within this time are served from memory without asking again. */
const FRESH_MS = 30 * 1000;
/** Background reading of the remote lists, so pages open from memory. */
const SYNC_INTERVAL_MS = 2 * 60 * 1000;

interface CachedList {
  list: FamilyTaskList;
  readAt: number;
}

/** Shared lists (shopping, chores...): Google Tasks lists and the family Reminders lists (CalDAV). */
@Injectable()
export class ListsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListsService.name);
  /** Last reading of every remote list: pages get it at once while a background read refreshes it. */
  private readonly cache = new Map<string, CachedList>();
  private readonly reading = new Map<string, Promise<FamilyTaskList>>();
  /** Time of the last write made here on each list. */
  private readonly writtenAt = new Map<string, number>();
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private firstSync: ReturnType<typeof setTimeout> | undefined;
  /** Last items read for each list: shown (with the error) when a provider fails. */
  private readonly lastGood = new Map<string, TaskItem[]>();
  private lastReminderLists: FamilyTaskList[] = [];
  private readonly completedHere = new Map<string, number>();

  public constructor(
    private readonly lists: TaskListsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly google: GoogleClient,
    private readonly dav: DavTasksClient,
    private readonly davGateway: DavGatewayService,
    private readonly homeAssistant: HomeAssistantClient,
    private readonly settings: SettingsRepository,
    private readonly icloud: IcloudBridge
  ) {}

  /** A failing list must not hide the others: the error is reported per list. */
  public async getLists(): Promise<ListsResponse> {
    const [remoteLists, reminderLists] = await Promise.all([
      Promise.all(this.remoteReaders().map(({ id, read, name, color }) => this.cached(id, read).then((list) => ({ ...list, name, color })))),
      this.reminderLists()
    ]);
    return { lists: [...reminderLists, ...remoteLists] };
  }

  public onModuleInit(): void {
    if (process.env.VITEST) {
      return;
    }
    const run = () => void this.refreshAll();
    this.syncTimer = setInterval(run, SYNC_INTERVAL_MS);
    this.firstSync = setTimeout(run, 5_000);
  }

  public onModuleDestroy(): void {
    clearInterval(this.syncTimer);
    clearTimeout(this.firstSync);
  }

  /** Background reading of every remote list; failures are already reported on each list. */
  public async refreshAll(): Promise<void> {
    await Promise.all(this.remoteReaders().map(({ id, read }) => this.refresh(id, read)));
  }

  /** Google, iCloud and Home Assistant lists, in display order, with the function that reads each one. */
  private remoteReaders(): Array<{ id: string; name: string; color: string; read: () => Promise<FamilyTaskList> }> {
    const configured = this.lists.list({ enabledOnly: true }).map((config) => ({
      id: config.id,
      name: config.name,
      color: config.color,
      read: () => (this.provider(config) === "icloudweb" ? this.icloudList(config) : this.googleList(config))
    }));
    // Without the add-on or a long-lived token Home Assistant lists are not shown at all.
    const home = (this.homeAssistant.available ? this.settings.get().homeLists : []).map((config) => ({
      id: HA_PREFIX + config.entityId,
      name: config.name,
      color: config.color,
      read: () => this.homeList(config)
    }));
    return [...configured, ...home];
  }

  /** The copy in memory when there is one (refreshed in the background when old), otherwise a reading now. */
  private async cached(id: string, read: () => Promise<FamilyTaskList>): Promise<FamilyTaskList> {
    const entry = this.cache.get(id);
    if (!entry) {
      return this.refresh(id, read);
    }
    if (Date.now() - entry.readAt >= FRESH_MS) {
      void this.refresh(id, read);
    }
    return entry.list;
  }

  /** One reading at a time per list; the readers never throw (errors become lastError). */
  private refresh(id: string, read: () => Promise<FamilyTaskList>): Promise<FamilyTaskList> {
    const running = this.reading.get(id);
    if (running) {
      return running;
    }
    const startedAt = Date.now();
    const reading = read()
      .then((list) => {
        // A reading started before a write made here may miss it: keep the updated copy and read again later.
        if ((this.writtenAt.get(id) ?? 0) > startedAt && this.cache.has(id)) {
          return this.cache.get(id)!.list;
        }
        this.cache.set(id, { list, readAt: Date.now() });
        return list;
      })
      .finally(() => this.reading.delete(id));
    this.reading.set(id, reading);
    return reading;
  }

  /**
   * After a write the copy in memory shows the change at once and the next request reads the list
   * again in the background.
   */
  private changed(listId: string, change: (tasks: TaskItem[]) => TaskItem[]): void {
    this.writtenAt.set(listId, Date.now());
    const entry = this.cache.get(listId);
    if (!entry) {
      return;
    }
    const tasks = change(entry.list.tasks);
    this.lastGood.set(listId, tasks);
    this.cache.set(listId, { list: { ...entry.list, tasks }, readAt: 0 });
  }

  private changedTask(listId: string, taskId: string, input: UpdateTaskInput): void {
    this.changed(listId, (tasks) =>
      tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.completed !== undefined ? { completed: input.completed, completedAt: input.completed ? new Date().toISOString() : null } : {})
            }
          : task
      )
    );
  }

  private newTask(id: string, title: string): TaskItem {
    return { id, title, notes: null, completed: false, completedAt: null, due: null };
  }

  /** A to-do list of Home Assistant chosen in Admin. */
  private async homeList(config: { entityId: string; name: string; color: string }): Promise<FamilyTaskList> {
    const base = { id: HA_PREFIX + config.entityId, name: config.name, color: config.color, source: "homeassistant" as const };
    try {
      const items = await this.homeAssistant.todoItems(config.entityId);
      const now = Date.now();
      const tasks = items
        .filter((item) => item.summary.trim() !== "")
        .filter((item) => item.status !== "completed" || now - (this.completedHere.get(`${config.entityId}/${item.uid}`) ?? 0) < COMPLETED_VISIBLE_MS)
        .map(
          (item): TaskItem => ({
            id: item.uid,
            title: item.summary.trim(),
            notes: item.description ?? null,
            completed: item.status === "completed",
            completedAt: item.status === "completed" ? new Date(this.completedHere.get(`${config.entityId}/${item.uid}`) ?? now).toISOString() : null,
            due: item.due ? new Date(item.due).toISOString() : null
          })
        );
      return { ...base, lastError: null, tasks: this.remember(base.id, tasks) };
    } catch (error) {
      this.logger.warn(`Reading Home Assistant list ${config.entityId} failed: ${error instanceof Error ? error.message : String(error)}`);
      return { ...base, ...this.fallback(base.id, error) };
    }
  }

  private homeEntity(listId: string): string {
    const entityId = listId.slice(HA_PREFIX.length);
    if (!this.settings.get().homeLists.some((list) => list.entityId === entityId)) {
      throw AppException.notFound("Lista non trovata.");
    }
    return entityId;
  }

  private async homeCall(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      throw AppException.providerError(error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.");
    }
  }

  /** Family lists on the built-in CalDAV server (the ones iPhones see in Reminders). */
  private async reminderLists(): Promise<FamilyTaskList[]> {
    if (!this.davGateway.enabled) {
      return [];
    }
    try {
      const lists = await this.dav.lists();
      return await Promise.all(
        lists.map(async (list): Promise<FamilyTaskList> => {
          const base = { id: DAV_PREFIX + list.name, name: list.displayName, color: list.color ?? "#F97316", source: "reminders" as const };
          try {
            return { ...base, lastError: null, tasks: this.remember(base.id, await this.dav.tasks(list.name)) };
          } catch (error) {
            return { ...base, ...this.fallback(base.id, error) };
          }
        })
      ).then((result) => (this.lastReminderLists = result));
    } catch (error) {
      this.logger.warn("Reading reminders lists failed: " + (error instanceof Error ? error.message : String(error)));
      return this.lastReminderLists.map((list) => ({ ...list, ...this.fallback(list.id, error) }));
    }
  }

  private provider(config: TaskListConfig): string | undefined {
    return this.accounts.findById(config.accountId)?.provider;
  }

  private icloudCredentials(accountId: string) {
    return () => {
      const credentials = this.accounts.credentials(accountId);
      if (!credentials) {
        throw new IcloudBridgeError("auth_required", "Account iCloud mancante.");
      }
      return { appleId: credentials.username, password: credentials.password };
    };
  }

  /** Open reminders plus the ones completed in the last two days; subtasks are left out. */
  private toTasks(reminders: IcloudReminder[]): TaskItem[] {
    const threshold = Date.now() - COMPLETED_VISIBLE_MS;
    return reminders
      .filter((reminder) => !reminder.parent && reminder.title.trim() !== "")
      .filter((reminder) => !reminder.completed || (reminder.completed_date !== null && Date.parse(reminder.completed_date) >= threshold))
      .map((reminder) => ({
        id: reminder.id,
        title: reminder.title.trim(),
        notes: reminder.desc || null,
        completed: reminder.completed,
        completedAt: reminder.completed_date,
        due: reminder.due_date
      }));
  }

  /** iCloud errors that need the Admin (code, password) are recorded on the account. */
  private icloudFailure(config: TaskListConfig, error: unknown): void {
    if (error instanceof IcloudBridgeError && ["2fa_required", "login_failed"].includes(error.code)) {
      this.accounts.recordStatus(config.accountId, error.code === "2fa_required" ? "verify" : "error", error.message);
    }
  }

  private async icloudList(config: TaskListConfig): Promise<FamilyTaskList> {
    try {
      const tasks = this.toTasks(await this.icloud.reminders(config.accountId, this.icloudCredentials(config.accountId), config.remoteId));
      this.lists.recordError(config.id, null);
      return { id: config.id, name: config.name, color: config.color, source: "icloud", lastError: null, tasks: this.remember(config.id, tasks) };
    } catch (error) {
      this.icloudFailure(config, error);
      const message = error instanceof Error ? error.message : "Errore iCloud.";
      this.logger.warn(`Reading iCloud list ${config.id} failed: ${message}`);
      this.lists.recordError(config.id, message);
      return { id: config.id, name: config.name, color: config.color, source: "icloud", ...this.fallback(config.id, error) };
    }
  }

  private async googleList(config: TaskListConfig): Promise<FamilyTaskList> {
    try {
      const tasks = await this.google.listTasks(this.secret(config.accountId), config.remoteId);
      this.lists.recordError(config.id, null);
      return { id: config.id, name: config.name, color: config.color, source: "google", lastError: null, tasks: this.remember(config.id, tasks) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore sconosciuto.";
      this.logger.warn(`Reading list ${config.id} failed: ${message}`);
      this.lists.recordError(config.id, message);
      return { id: config.id, name: config.name, color: config.color, source: "google", ...this.fallback(config.id, error) };
    }
  }

  private remember(listId: string, tasks: TaskItem[]): TaskItem[] {
    this.lastGood.set(listId, tasks);
    return tasks;
  }

  private fallback(listId: string, error: unknown): { lastError: string; tasks: TaskItem[] } {
    const message = error instanceof Error ? error.message : "Errore sconosciuto.";
    const tasks = this.lastGood.get(listId);
    return tasks ? { lastError: `${message} Mostro le ultime voci lette.`, tasks } : { lastError: message, tasks: [] };
  }

  /**
   * Items completed often in a list and not open now, most frequent (then most recent) first.
   * Reminder lists keep their history on the CalDAV server; Home Assistant lists give the completed
   * items they still have; Google lists have no history here.
   */
  public async suggestions(listId: string): Promise<string[]> {
    let history: Array<{ title: string; completed: boolean; at: number }>;
    try {
      if (listId.startsWith(DAV_PREFIX)) {
        history = (await this.dav.allTasks(listId.slice(DAV_PREFIX.length))).map((task) => ({
          title: task.title,
          completed: task.completed,
          at: task.completedAt ? Date.parse(task.completedAt) : 0
        }));
      } else if (this.lists.findById(listId) && this.provider(this.lists.findById(listId)!) === "icloudweb") {
        const list = this.lists.findById(listId)!;
        history = (await this.icloud.reminders(list.accountId, this.icloudCredentials(list.accountId), list.remoteId)).map((reminder) => ({
          title: reminder.title,
          completed: reminder.completed,
          at: reminder.completed_date ? Date.parse(reminder.completed_date) : 0
        }));
      } else if (listId.startsWith(HA_PREFIX)) {
        history = (await this.homeAssistant.todoItems(this.homeEntity(listId))).map((item) => ({ title: item.summary, completed: item.status === "completed", at: 0 }));
      } else {
        return [];
      }
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      this.logger.warn(`Reading the history of list ${listId} failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }

    const open = new Set(history.filter((item) => !item.completed).map((item) => ingredientKey(item.title)));
    const since = Date.now() - SUGGESTION_WINDOW_MS;
    const counted = new Map<string, { title: string; count: number; last: number }>();
    for (const item of history) {
      const key = ingredientKey(item.title);
      if (!item.completed || open.has(key) || (item.at !== 0 && item.at < since) || key === "") {
        continue;
      }
      const entry = counted.get(key) ?? { title: item.title.trim(), count: 0, last: 0 };
      entry.count += 1;
      if (item.at >= entry.last) {
        entry.last = item.at;
        entry.title = item.title.trim();
      }
      counted.set(key, entry);
    }
    return [...counted.values()]
      .sort((left, right) => right.count - left.count || right.last - left.last || left.title.localeCompare(right.title))
      .slice(0, MAX_SUGGESTIONS)
      .map((entry) => entry.title);
  }

  public listConfigs(): TaskListConfig[] {
    return this.lists.list();
  }

  public async discover(accountId: string): Promise<RemoteTaskList[]> {
    const account = this.accounts.findById(accountId);
    if (!account) {
      throw AppException.notFound("Account non trovato.");
    }
    if (account.provider !== "google" && account.provider !== "icloudweb") {
      throw AppException.validation("Le liste sono disponibili solo per gli account Google e Promemoria iCloud.");
    }
    const added = this.lists.remoteIdsForAccount(accountId);
    if (account.provider === "icloudweb") {
      try {
        const remote = await this.icloud.lists(accountId, this.icloudCredentials(accountId));
        return remote.map((list) => ({ remoteId: list.id, name: list.title, alreadyAdded: added.has(list.id) }));
      } catch (error) {
        throw toAppException(error);
      }
    }
    try {
      const remote = await this.google.listTaskLists(this.secret(accountId));
      return remote.map((list) => ({ ...list, alreadyAdded: added.has(list.remoteId) }));
    } catch (error) {
      throw toAppException(error);
    }
  }

  public add(input: AddTaskListInput): TaskListConfig {
    if (!["google", "icloudweb"].includes(this.accounts.findById(input.accountId)?.provider ?? "")) {
      throw AppException.notFound("Account non trovato.");
    }
    if (this.lists.remoteIdsForAccount(input.accountId).has(input.remoteId)) {
      throw AppException.conflict("Questa lista è già stata aggiunta.");
    }
    return this.lists.insert(input);
  }

  public update(listId: string, input: UpdateTaskListInput): TaskListConfig {
    this.requireList(listId);
    return this.lists.update(listId, input);
  }

  public delete(listId: string): void {
    this.requireList(listId);
    this.lists.delete(listId);
    this.cache.delete(listId);
  }

  public async createTask(listId: string, input: CreateTaskInput): Promise<{ id: string }> {
    if (listId.startsWith(HA_PREFIX)) {
      const entityId = this.homeEntity(listId);
      await this.homeCall(() => this.homeAssistant.callService("todo", "add_item", entityId, { item: input.title }));
      this.changed(listId, (tasks) => [this.newTask(`pending-${Date.now()}`, input.title), ...tasks]);
      return { id: "" };
    }
    if (listId.startsWith(DAV_PREFIX)) {
      return { id: await this.davCall(() => this.dav.createTask(listId.slice(DAV_PREFIX.length), input.title)) };
    }
    const list = this.requireList(listId);
    let id: string;
    if (this.provider(list) === "icloudweb") {
      id = await this.icloudCall(async () => (await this.icloud.create(list.accountId, this.icloudCredentials(list.accountId), list.remoteId, input.title)).id);
    } else {
      try {
        id = await this.google.createTask(this.secret(list.accountId), list.remoteId, input.title);
      } catch (error) {
        throw toAppException(error);
      }
    }
    this.changed(listId, (tasks) => [this.newTask(id, input.title), ...tasks]);
    return { id };
  }

  public async updateTask(listId: string, taskId: string, input: UpdateTaskInput): Promise<void> {
    if (listId.startsWith(HA_PREFIX)) {
      const entityId = this.homeEntity(listId);
      const data: Record<string, unknown> = { item: taskId };
      if (input.title !== undefined) {
        data.rename = input.title;
      }
      if (input.completed !== undefined) {
        data.status = input.completed ? "completed" : "needs_action";
        if (input.completed) {
          this.completedHere.set(`${entityId}/${taskId}`, Date.now());
        } else {
          this.completedHere.delete(`${entityId}/${taskId}`);
        }
      }
      await this.homeCall(() => this.homeAssistant.callService("todo", "update_item", entityId, data));
      this.changedTask(listId, taskId, input);
      return;
    }
    if (listId.startsWith(DAV_PREFIX)) {
      await this.davCall(() => this.dav.updateTask(listId.slice(DAV_PREFIX.length), taskId, input));
      return;
    }
    const list = this.requireList(listId);
    if (this.provider(list) === "icloudweb") {
      await this.icloudCall(() => this.icloud.update(list.accountId, this.icloudCredentials(list.accountId), taskId, input));
    } else {
      try {
        await this.google.updateTask(this.secret(list.accountId), list.remoteId, taskId, input);
      } catch (error) {
        throw toAppException(error);
      }
    }
    this.changedTask(listId, taskId, input);
  }

  public async deleteTask(listId: string, taskId: string): Promise<void> {
    if (listId.startsWith(HA_PREFIX)) {
      const entityId = this.homeEntity(listId);
      await this.homeCall(() => this.homeAssistant.callService("todo", "remove_item", entityId, { item: [taskId] }));
      this.changed(listId, (tasks) => tasks.filter((task) => task.id !== taskId));
      return;
    }
    if (listId.startsWith(DAV_PREFIX)) {
      await this.davCall(() => this.dav.deleteTask(listId.slice(DAV_PREFIX.length), taskId));
      return;
    }
    const list = this.requireList(listId);
    if (this.provider(list) === "icloudweb") {
      await this.icloudCall(() => this.icloud.delete(list.accountId, this.icloudCredentials(list.accountId), taskId));
    } else {
      try {
        await this.google.deleteTask(this.secret(list.accountId), list.remoteId, taskId);
      } catch (error) {
        throw toAppException(error);
      }
    }
    this.changed(listId, (tasks) => tasks.filter((task) => task.id !== taskId));
  }

  private async icloudCall<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      throw toAppException(error);
    }
  }

  private async davCall<T>(action: () => Promise<T>): Promise<T> {
    if (!this.davGateway.enabled) {
      throw AppException.notFound("Liste Promemoria non attive.");
    }
    try {
      return await action();
    } catch (error) {
      throw AppException.providerError(error instanceof Error ? error.message : "Errore CalDAV.");
    }
  }

  private requireList(listId: string): TaskListConfig {
    const list = this.lists.findById(listId);
    if (!list) {
      throw AppException.notFound("Lista non trovata.");
    }
    return list;
  }

  private secret(accountId: string): GoogleSecret {
    const credentials = this.accounts.credentials(accountId);
    if (!credentials) {
      throw AppException.notFound("Account della lista mancante.");
    }
    return parseGoogleSecret(credentials.password);
  }
}
