import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsRepository } from "./settings.repository";

@Module({
  controllers: [SettingsController],
  providers: [SettingsRepository],
  exports: [SettingsRepository]
})
export class SettingsModule {}
