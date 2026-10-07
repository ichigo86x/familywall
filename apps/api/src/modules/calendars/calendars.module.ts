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
import { MenuController } from "./menu.controller";
import { MenuRepository } from "./menu.repository";
import { CalendarCacheRepository } from "./calendar-cache.repository";

@Module({
  imports: [MembersModule, ProvidersModule, SettingsModule],
  controllers: [CalendarsController, EventsController, OccasionsController, MenuController],
  providers: [CalendarsRepository, EventsRepository, OccasionsRepository, CalendarCacheRepository, MenuRepository, CalendarsService, EventsService]
})
export class CalendarsModule {}
