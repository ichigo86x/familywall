import { describe, expect, it, vi } from "vitest";
import { weatherCondition } from "@familywall/shared";
import { openDatabase } from "../../database/database";
import { SettingsRepository } from "../settings/settings.repository";
import { WeatherClient } from "./weather-client";
import { WeatherService } from "./weather.service";

const FORECAST = {
  current: { temperature_2m: 17.6, weather_code: 61, is_day: 1 },
  daily: {
    time: ["2026-10-07", "2026-10-08"],
    weather_code: [63, 2],
    temperature_2m_max: [19.4, 21.2],
    temperature_2m_min: [11.1, 10.6],
    precipitation_probability_max: [80, 10]
  }
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("weatherCondition", () => {
  it("maps WMO codes", () => {
    expect([0, 2, 3, 45, 53, 63, 81, 73, 95].map(weatherCondition)).toEqual(["clear", "partly-cloudy", "cloudy", "fog", "drizzle", "rain", "rain", "snow", "storm"]);
  });
});

describe("WeatherService", () => {
  const setup = (fetchImpl: (url: string) => Promise<Response>) => {
    const settings = new SettingsRepository(openDatabase(":memory:"));
    let time = 0;
    const service = new WeatherService(settings, new WeatherClient(vi.fn(fetchImpl)), () => time);
    return { settings, service, advance: (ms: number) => (time += ms) };
  };

  it("returns nothing until a place is chosen, then caches the forecast", async () => {
    const fetchImpl = vi.fn(async (_url: string) => json(FORECAST));
    const { settings, service, advance } = setup(fetchImpl);
    expect(await service.current()).toBeNull();

    settings.update({ weatherLocation: { name: "Milano, Lombardia, Italia", latitude: 45.46, longitude: 9.19 } });
    const report = await service.current();
    expect(report).toMatchObject({
      current: { temperature: 18, condition: "rain", isDay: true },
      today: { date: "2026-10-07", condition: "rain", max: 19, min: 11, precipitationChance: 80 },
      tomorrow: { condition: "partly-cloudy", max: 21 }
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("timezone=Europe%2FRome");

    await service.current();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    advance(21 * 60 * 1000);
    fetchImpl.mockResolvedValueOnce(json({}, 500));
    expect(await service.current()).toMatchObject({ current: { temperature: 18 } });
  });

  it("searches places by name", async () => {
    const { service } = setup(async () =>
      json({ results: [{ name: "Milano", latitude: 45.46, longitude: 9.19, admin1: "Lombardia", country: "Italia" }] })
    );
    expect(await service.searchPlaces("x")).toEqual([]);
    expect(await service.searchPlaces("Milano")).toEqual([{ name: "Milano, Lombardia, Italia", latitude: 45.46, longitude: 9.19 }]);
  });
});
