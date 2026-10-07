import { Module } from "@nestjs/common";
import { DavModule } from "../dav/dav.module";
import { MembersModule } from "../members/members.module";
import { ScheduleController } from "./schedule.controller";

@Module({
  imports: [MembersModule, DavModule],
  controllers: [ScheduleController]
})
export class ScheduleModule {}
