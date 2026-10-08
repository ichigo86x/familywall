import { Injectable, Logger } from "@nestjs/common";
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

/** Shared lists (shopping, chores...): Google Tasks lists and the family Reminders lists (CalDAV). */
@Injectable()
export class ListsService {
  private readonly logger = new Logger(ListsService.name);
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
    private readonly settings: SettingsRepository
  ) {}

  /** A failing list must not hide the others: the error is reported per list. */
  public async getLists(): Promise<ListsResponse> {
    const [googleLists, reminderLists, homeLists] = await Promise.all([this.googleLists(), this.reminderLists(), this.homeLists()]);
    return { lists: [...reminderLists, ...googleLists, ...homeLists] };
  }

  /** To-do lists of Home Assistant chosen in Admin (for example Apple Reminders through the iCloud integration). */
  private async homeLists(): Promise<FamilyTaskList[]> {
    const configs = this.settings.get().homeLists;
    return Promise.all(
      configs.map(async (config): Promise<FamilyTaskList> => {
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
      })
    );
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

  private async googleLists(): Promise<FamilyTaskList[]> {
    return Promise.all(
      this.lists.list({ enabledOnly: true }).map(async (config): Promise<FamilyTaskList> => {
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
      })
    );
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

  public listConfigs(): TaskListConfig[] {
    return this.lists.list();
  }

  public async discover(accountId: string): Promise<RemoteTaskList[]> {
    const account = this.accounts.findById(accountId);
    if (!account) {
      throw AppException.notFound("Account non trovato.");
    }
    if (account.provider !== "google") {
      throw AppException.validation("Le liste sono disponibili solo per gli account Google.");
    }
    const added = this.lists.remoteIdsForAccount(accountId);
    try {
      const remote = await this.google.listTaskLists(this.secret(accountId));
      return remote.map((list) => ({ ...list, alreadyAdded: added.has(list.remoteId) }));
    } catch (error) {
      throw toAppException(error);
    }
  }

  public add(input: AddTaskListInput): TaskListConfig {
    if (this.accounts.findById(input.accountId)?.provider !== "google") {
      throw AppException.notFound("Account Google non trovato.");
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
  }

  public async createTask(listId: string, input: CreateTaskInput): Promise<{ id: string }> {
    if (listId.startsWith(HA_PREFIX)) {
      const entityId = this.homeEntity(listId);
      await this.homeCall(() => this.homeAssistant.callService("todo", "add_item", entityId, { item: input.title }));
      return { id: "" };
    }
    if (listId.startsWith(DAV_PREFIX)) {
      return { id: await this.davCall(() => this.dav.createTask(listId.slice(DAV_PREFIX.length), input.title)) };
    }
    const list = this.requireList(listId);
    try {
      return { id: await this.google.createTask(this.secret(list.accountId), list.remoteId, input.title) };
    } catch (error) {
      throw toAppException(error);
    }
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
      return;
    }
    if (listId.startsWith(DAV_PREFIX)) {
      await this.davCall(() => this.dav.updateTask(listId.slice(DAV_PREFIX.length), taskId, input));
      return;
    }
    const list = this.requireList(listId);
    try {
      await this.google.updateTask(this.secret(list.accountId), list.remoteId, taskId, input);
    } catch (error) {
      throw toAppException(error);
    }
  }

  public async deleteTask(listId: string, taskId: string): Promise<void> {
    if (listId.startsWith(HA_PREFIX)) {
      const entityId = this.homeEntity(listId);
      await this.homeCall(() => this.homeAssistant.callService("todo", "remove_item", entityId, { item: [taskId] }));
      return;
    }
    if (listId.startsWith(DAV_PREFIX)) {
      await this.davCall(() => this.dav.deleteTask(listId.slice(DAV_PREFIX.length), taskId));
      return;
    }
    const list = this.requireList(listId);
    try {
      await this.google.deleteTask(this.secret(list.accountId), list.remoteId, taskId);
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
