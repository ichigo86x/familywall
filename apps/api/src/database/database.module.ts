import { Global, Module } from "@nestjs/common";
import path from "node:path";
import { loadOrCreateKey } from "../common/crypto/keys";
import { SECRET_BOX, SecretBox } from "../common/crypto/secret-box";
import { appConfig } from "../config/app-config";
import { DATABASE, openDatabase } from "./database";

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: () => openDatabase(path.join(appConfig.dataDir, "familywall.db"))
    },
    {
      provide: SECRET_BOX,
      useFactory: () => new SecretBox(loadOrCreateKey(appConfig.dataDir, "secret.key", "FAMILYWALL_SECRET_KEY"))
    }
  ],
  exports: [DATABASE, SECRET_BOX]
})
export class DatabaseModule {}
