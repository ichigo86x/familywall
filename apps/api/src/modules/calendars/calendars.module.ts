import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { ProvidersModule } from "../providers/providers.module";
import { SettingsModule } from "../settings/settings.module";
import { CalendarsController } from "./calendars.controller";
import { CalendarsRepository } from "./calendars.repository";
import { CalendarsService } from "./calendars.service";
import { EventsController } from "./events.controller";
import { EventsRepository } from "./events.repository";
import { EventsService } from "./events.service";
import { OccasionsController } from "./occasions.controller";
import { OccasionsRepository } from "./occasions.repository";

@Module({
  imports: [MembersModule, ProvidersModule, SettingsModule],
  controllers: [CalendarsController, EventsController, OccasionsController],
  providers: [CalendarsRepository, EventsRepository, OccasionsRepository, CalendarsService, EventsService]
})
export class CalendarsModule {}
