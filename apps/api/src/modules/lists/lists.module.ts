import { Module } from "@nestjs/common";
import { DavModule } from "../dav/dav.module";
import { ProvidersModule } from "../providers/providers.module";
import { SettingsModule } from "../settings/settings.module";
import { ListsController } from "./lists.controller";
import { ListsService } from "./lists.service";
import { TaskListsRepository } from "./task-lists.repository";

@Module({
  imports: [ProvidersModule, DavModule, SettingsModule],
  controllers: [ListsController],
  providers: [ListsService, TaskListsRepository]
})
export class ListsModule {}
