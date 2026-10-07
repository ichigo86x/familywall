import { Controller, Get, Query } from "@nestjs/common";
import type { WeatherLocation, WeatherResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { WeatherService } from "./weather.service";

@Controller("weather")
export class WeatherController {
  public constructor(private readonly weather: WeatherService) {}

  @Get()
  @RequirePermission("calendar:read")
  public async current(): Promise<WeatherResponse> {
    return { weather: await this.weather.current() };
  }

  @Get("places")
  @RequirePermission("settings:manage")
  public async places(@Query("q") query?: string): Promise<{ places: WeatherLocation[] }> {
    return { places: await this.weather.searchPlaces(String(query ?? "")) };
  }
}
