import { Module } from "@nestjs/common";
import { appConfig } from "../../config/app-config";
import { SettingsModule } from "../settings/settings.module";
import { SettingsRepository } from "../settings/settings.repository";
import { HomeAssistantClient } from "./home-assistant.client";
import { HomeController } from "./home.controller";
import { HomeService } from "./home.service";

@Module({
  imports: [SettingsModule],
  controllers: [HomeController],
  providers: [
    { provide: HomeAssistantClient, useFactory: () => new HomeAssistantClient(appConfig.homeAssistant) },
    {
      provide: HomeService,
      useFactory: (settings: SettingsRepository, client: HomeAssistantClient) => new HomeService(settings, client),
      inject: [SettingsRepository, HomeAssistantClient]
    }
  ],
  exports: [HomeAssistantClient]
})
export class HomeModule {}
