import { Module } from "@nestjs/common";
import { DavModule } from "../dav/dav.module";
import { MembersModule } from "../members/members.module";
import { SettingsModule } from "../settings/settings.module";
import { ScheduleController } from "./schedule.controller";

@Module({
  imports: [MembersModule, DavModule, SettingsModule],
  controllers: [ScheduleController]
})
export class ScheduleModule {}
