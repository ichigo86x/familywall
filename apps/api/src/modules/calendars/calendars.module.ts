import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { ProvidersModule } from "../providers/providers.module";
import { CalendarsController } from "./calendars.controller";
import { CalendarsRepository } from "./calendars.repository";
import { CalendarsService } from "./calendars.service";
import { EventsController } from "./events.controller";
import { EventsRepository } from "./events.repository";
import { EventsService } from "./events.service";

@Module({
  imports: [MembersModule, ProvidersModule],
  controllers: [CalendarsController, EventsController],
  providers: [CalendarsRepository, EventsRepository, CalendarsService, EventsService]
})
export class CalendarsModule {}
