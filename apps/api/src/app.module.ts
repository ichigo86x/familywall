import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtAuthGuard } from "./common/auth/jwt-auth.guard";
import { PermissionsGuard } from "./common/auth/permissions.guard";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CalendarsModule } from "./modules/calendars/calendars.module";
import { DavModule } from "./modules/dav/dav.module";
import { HealthModule } from "./modules/health/health.module";
import { ListsModule } from "./modules/lists/lists.module";
import { MembersModule } from "./modules/members/members.module";
import { NotesModule } from "./modules/notes/notes.module";
import { ProvidersModule } from "./modules/providers/providers.module";
import { ScheduleModule } from "./modules/schedule/schedule.module";
import { SettingsModule } from "./modules/settings/settings.module";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    MembersModule,
    SettingsModule,
    ProvidersModule,
    CalendarsModule,
    DavModule,
    ListsModule,
    NotesModule,
    ScheduleModule,
    HealthModule
  ],
  providers: [
    // Order matters: authentication sets request.user before permissions are checked.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard }
  ]
})
export class AppModule {}
