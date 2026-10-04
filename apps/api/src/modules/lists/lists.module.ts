import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { ListsController } from "./lists.controller";
import { ListsService } from "./lists.service";
import { TaskListsRepository } from "./task-lists.repository";

@Module({
  imports: [ProvidersModule],
  controllers: [ListsController],
  providers: [ListsService, TaskListsRepository]
})
export class ListsModule {}
