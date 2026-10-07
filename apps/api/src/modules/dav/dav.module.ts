import { Module } from "@nestjs/common";
import { MembersModule } from "../members/members.module";
import { SettingsModule } from "../settings/settings.module";
import { DavBootstrap } from "./dav-bootstrap";
import { DavGatewayService } from "./dav-gateway.service";
import { DavStore, RadicaleDavStore } from "./dav-store";
import { DavTasksClient } from "./dav-tasks.client";
import { DavController } from "./dav.controller";
import { MenuStore, NotesStore, OccasionsStore, ScheduleStore } from "./family-stores";
import { LegacyDataMigration } from "./legacy-migration";

@Module({
  imports: [MembersModule, SettingsModule],
  controllers: [DavController],
  providers: [
    DavGatewayService,
    DavBootstrap,
    { provide: DavTasksClient, inject: [DavGatewayService], useFactory: (gateway: DavGatewayService) => new DavTasksClient(gateway.radicaleUrl) },
    { provide: DavStore, inject: [DavGatewayService], useFactory: (gateway: DavGatewayService) => new RadicaleDavStore(gateway.radicaleUrl, gateway.enabled) },
    OccasionsStore,
    MenuStore,
    NotesStore,
    ScheduleStore,
    LegacyDataMigration
  ],
  exports: [DavGatewayService, DavTasksClient, DavStore, OccasionsStore, MenuStore, NotesStore, ScheduleStore, LegacyDataMigration]
})
export class DavModule {}
