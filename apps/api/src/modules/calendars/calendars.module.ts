import { Module } from "@nestjs/common";
import { DavModule } from "../dav/dav.module";
import { HomeModule } from "../home/home.module";
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
import { MenuController } from "./menu.controller";
import { CalendarCacheRepository } from "./calendar-cache.repository";

@Module({
  imports: [MembersModule, ProvidersModule, SettingsModule, DavModule, HomeModule],
  controllers: [CalendarsController, EventsController, OccasionsController, MenuController],
  providers: [CalendarsRepository, EventsRepository, CalendarCacheRepository, CalendarsService, EventsService]
})
export class CalendarsModule {}
