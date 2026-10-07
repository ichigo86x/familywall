import { Injectable, Logger } from "@nestjs/common";
import type { WeatherLocation, WeatherReport } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { SettingsRepository } from "../settings/settings.repository";
import { WeatherClient, WeatherError } from "./weather-client";

/** Wall panels refresh every few minutes: one forecast request per place every 20 minutes is plenty. */
const CACHE_MS = 20 * 60 * 1000;

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private cache: { key: string; expiresAt: number; report: WeatherReport } | null = null;

  public constructor(
    private readonly settings: SettingsRepository,
    private readonly client: WeatherClient,
    private readonly now: () => number = Date.now
  ) {}

  public async current(): Promise<WeatherReport | null> {
    const { weatherLocation, timezone } = this.settings.get();
    if (!weatherLocation) {
      return null;
    }
    const key = `${weatherLocation.latitude},${weatherLocation.longitude},${timezone}`;
    if (this.cache && this.cache.key === key && this.cache.expiresAt > this.now()) {
      return { ...this.cache.report, location: weatherLocation };
    }
    try {
      const report = await this.client.forecast(weatherLocation, timezone);
      this.cache = { key, expiresAt: this.now() + CACHE_MS, report };
      return report;
    } catch (error) {
      this.logger.warn(`Weather forecast failed: ${error instanceof Error ? error.message : String(error)}`);
      // A slightly old forecast is better than none on a wall panel.
      if (this.cache?.key === key) {
        return this.cache.report;
      }
      throw toAppError(error);
    }
  }

  public async searchPlaces(query: string): Promise<WeatherLocation[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return [];
    }
    try {
      return await this.client.searchPlaces(trimmed.slice(0, 80));
    } catch (error) {
      throw toAppError(error);
    }
  }
}

const toAppError = (error: unknown): AppException =>
  AppException.providerError(error instanceof WeatherError ? error.message : "Servizio meteo non disponibile.");
