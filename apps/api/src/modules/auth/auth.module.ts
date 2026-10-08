import { Module } from "@nestjs/common";
import { loadOrCreateKey } from "../../common/crypto/keys";
import { appConfig } from "../../config/app-config";
import { MembersModule } from "../members/members.module";
import { SettingsModule } from "../settings/settings.module";
import { AuthController } from "./auth.controller";
import { AuthService, JWT_SECRET } from "./auth.service";
import { TotpService } from "./totp.service";

@Module({
  imports: [MembersModule, SettingsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpService,
    {
      provide: JWT_SECRET,
      useFactory: () => loadOrCreateKey(appConfig.dataDir, "jwt.key", "JWT_SECRET")
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
