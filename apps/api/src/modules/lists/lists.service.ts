import { Injectable, Logger } from "@nestjs/common";
import type {
  AddTaskListInput,
  CreateTaskInput,
  FamilyTaskList,
  ListsResponse,
  RemoteTaskList,
  TaskListConfig,
  UpdateTaskInput,
  UpdateTaskListInput
} from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { GoogleClient, parseGoogleSecret, type GoogleSecret } from "../providers/google/google-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { toAppException } from "../providers/providers.service";
import { TaskListsRepository } from "./task-lists.repository";

/** Shared lists (shopping, chores...) backed by Google Tasks; every item lives on Google. */
@Injectable()
export class ListsService {
  private readonly logger = new Logger(ListsService.name);

  public constructor(
    private readonly lists: TaskListsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly google: GoogleClient
  ) {}

  /** A failing list must not hide the others: the error is reported per list. */
  public async getLists(): Promise<ListsResponse> {
    const lists = await Promise.all(
      this.lists.list({ enabledOnly: true }).map(async (config): Promise<FamilyTaskList> => {
        try {
          const tasks = await this.google.listTasks(this.secret(config.accountId), config.remoteId);
          this.lists.recordError(config.id, null);
          return { id: config.id, name: config.name, color: config.color, lastError: null, tasks };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Errore sconosciuto.";
          this.logger.warn(`Reading list ${config.id} failed: ${message}`);
          this.lists.recordError(config.id, message);
          return { id: config.id, name: config.name, color: config.color, lastError: message, tasks: [] };
        }
      })
    );
    return { lists };
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
    const list = this.requireList(listId);
    try {
      return { id: await this.google.createTask(this.secret(list.accountId), list.remoteId, input.title) };
    } catch (error) {
      throw toAppException(error);
    }
  }

  public async updateTask(listId: string, taskId: string, input: UpdateTaskInput): Promise<void> {
    const list = this.requireList(listId);
    try {
      await this.google.updateTask(this.secret(list.accountId), list.remoteId, taskId, input);
    } catch (error) {
      throw toAppException(error);
    }
  }

  public async deleteTask(listId: string, taskId: string): Promise<void> {
    const list = this.requireList(listId);
    try {
      await this.google.deleteTask(this.secret(list.accountId), list.remoteId, taskId);
    } catch (error) {
      throw toAppException(error);
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
