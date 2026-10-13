import { Module } from "@nestjs/common";
import { SECRET_BOX, SecretBox } from "../../common/crypto/secret-box";
import { appConfig } from "../../config/app-config";
import { DATABASE, type Database } from "../../database/database";
import { DavModule } from "../dav/dav.module";
import { SettingsModule } from "../settings/settings.module";
import { SettingsRepository } from "../settings/settings.repository";
import { RemoteBackupService } from "./remote-backup.service";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

@Module({
  imports: [DavModule, SettingsModule],
  controllers: [BackupController],
  providers: [
    {
      provide: BackupService,
      useFactory: (db: Database, secrets: SecretBox) => new BackupService(db, secrets, appConfig.dataDir),
      inject: [DATABASE, SECRET_BOX]
    },
    {
      provide: RemoteBackupService,
      useFactory: (backup: BackupService, settings: SettingsRepository, secrets: SecretBox) => new RemoteBackupService(backup, settings, secrets),
      inject: [BackupService, SettingsRepository, SECRET_BOX]
    }
  ]
})
export class BackupModule {}
