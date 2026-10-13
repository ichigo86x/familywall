import { Module } from "@nestjs/common";
import { SECRET_BOX, type SecretBox } from "../../common/crypto/secret-box";
import { appConfig } from "../../config/app-config";
import { SettingsModule } from "../settings/settings.module";
import { SettingsRepository } from "../settings/settings.repository";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

@Module({
  imports: [SettingsModule],
  controllers: [PhotosController],
  providers: [
    {
      provide: PhotosService,
      useFactory: (settings: SettingsRepository, secrets: SecretBox) => new PhotosService(settings, secrets, appConfig.mediaDir),
      inject: [SettingsRepository, SECRET_BOX]
    }
  ]
})
export class PhotosModule {}
