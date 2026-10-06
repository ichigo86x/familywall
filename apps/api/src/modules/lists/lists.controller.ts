import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import type {
  AddTaskListInput,
  CreateTaskInput,
  ListsResponse,
  RemoteTaskListsResponse,
  TaskListConfigResponse,
  TaskListConfigsResponse,
  UpdateTaskInput,
  UpdateTaskListInput
} from "@familywall/shared";
import { addTaskListSchema, createTaskSchema, dashboardListsSchema, updateTaskListSchema, updateTaskSchema } from "@familywall/shared";
import type { DashboardListsInput } from "@familywall/shared";
import { SettingsRepository } from "../settings/settings.repository";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ListsService } from "./lists.service";

@Controller("lists")
export class ListsController {
  public constructor(
    private readonly listsService: ListsService,
    private readonly settings: SettingsRepository
  ) {}

  @Patch("dashboard")
  @RequirePermission("lists:write")
  public setDashboardLists(@Body(new ZodValidationPipe(dashboardListsSchema)) input: DashboardListsInput): { listIds: string[] } {
    return { listIds: this.settings.update({ dashboardListIds: input.listIds }).dashboardListIds };
  }

  @Get()
  @RequirePermission("calendar:read")
  public getLists(): Promise<ListsResponse> {
    return this.listsService.getLists();
  }

  @Get("config")
  @RequirePermission("providers:manage")
  public configs(): TaskListConfigsResponse {
    return { lists: this.listsService.listConfigs() };
  }

  @Get("discover/:accountId")
  @RequirePermission("providers:manage")
  public async discover(@Param("accountId") accountId: string): Promise<RemoteTaskListsResponse> {
    return { lists: await this.listsService.discover(accountId) };
  }

  @Post("config")
  @RequirePermission("providers:manage")
  public add(@Body(new ZodValidationPipe(addTaskListSchema)) input: AddTaskListInput): TaskListConfigResponse {
    return { list: this.listsService.add(input) };
  }

  @Patch("config/:listId")
  @RequirePermission("providers:manage")
  public update(@Param("listId") listId: string, @Body(new ZodValidationPipe(updateTaskListSchema)) input: UpdateTaskListInput): TaskListConfigResponse {
    return { list: this.listsService.update(listId, input) };
  }

  @Delete("config/:listId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("providers:manage")
  public remove(@Param("listId") listId: string): void {
    this.listsService.delete(listId);
  }

  @Post(":listId/tasks")
  @RequirePermission("lists:write")
  public createTask(@Param("listId") listId: string, @Body(new ZodValidationPipe(createTaskSchema)) input: CreateTaskInput): Promise<{ id: string }> {
    return this.listsService.createTask(listId, input);
  }

  @Patch(":listId/tasks/:taskId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("lists:write")
  public updateTask(
    @Param("listId") listId: string,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) input: UpdateTaskInput
  ): Promise<void> {
    return this.listsService.updateTask(listId, taskId, input);
  }

  @Delete(":listId/tasks/:taskId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("lists:write")
  public deleteTask(@Param("listId") listId: string, @Param("taskId") taskId: string): Promise<void> {
    return this.listsService.deleteTask(listId, taskId);
  }
}
