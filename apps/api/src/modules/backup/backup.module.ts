import { Module } from "@nestjs/common";
import { SECRET_BOX, SecretBox } from "../../common/crypto/secret-box";
import { appConfig } from "../../config/app-config";
import { DATABASE, type Database } from "../../database/database";
import { DavModule } from "../dav/dav.module";
import { BackupController } from "./backup.controller";
import { BackupService } from "./backup.service";

@Module({
  imports: [DavModule],
  controllers: [BackupController],
  providers: [
    {
      provide: BackupService,
      useFactory: (db: Database, secrets: SecretBox) => new BackupService(db, secrets, appConfig.dataDir),
      inject: [DATABASE, SECRET_BOX]
    }
  ]
})
export class BackupModule {}
