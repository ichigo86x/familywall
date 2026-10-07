import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { SettingsRepository } from "../settings/settings.repository";
import { WeatherClient } from "./weather-client";
import { WeatherController } from "./weather.controller";
import { WeatherService } from "./weather.service";

@Module({
  imports: [SettingsModule],
  controllers: [WeatherController],
  providers: [
    { provide: WeatherClient, useFactory: () => new WeatherClient() },
    {
      provide: WeatherService,
      useFactory: (settings: SettingsRepository, client: WeatherClient) => new WeatherService(settings, client),
      inject: [SettingsRepository, WeatherClient]
    }
  ]
})
export class WeatherModule {}
