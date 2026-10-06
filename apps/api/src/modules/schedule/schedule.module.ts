import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { ScheduleController } from "./schedule.controller";
import { ScheduleRepository } from "./schedule.repository";

@Module({
  imports: [MembersModule],
  controllers: [ScheduleController],
  providers: [ScheduleRepository]
})
export class ScheduleModule {}
