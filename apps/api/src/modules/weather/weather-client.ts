import { weatherCondition, type WeatherDay, type WeatherLocation, type WeatherReport } from "@familywall/shared";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class WeatherError extends Error {}

interface ForecastPayload {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: Array<number | null>;
  };
}

interface GeocodingPayload {
  results?: Array<{ name: string; latitude: number; longitude: number; admin1?: string; country?: string }>;
}

/**
 * Open-Meteo forecast and geocoding: free, no API key, only the coordinates leave the house.
 * https://open-meteo.com/en/docs
 */
export class WeatherClient {
  public constructor(
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 10_000
  ) {}

  public async forecast(location: WeatherLocation, timezone: string): Promise<WeatherReport> {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,weather_code,is_day",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone,
      forecast_days: "2"
    }).toString();

    const payload = (await this.get(url.toString())) as ForecastPayload;
    const current = payload.current;
    const daily = payload.daily;
    if (current?.temperature_2m === undefined || current.weather_code === undefined || !daily?.time || daily.time.length < 2) {
      throw new WeatherError("Risposta del servizio meteo incompleta.");
    }
    const temperature = current.temperature_2m;

    const day = (index: number): WeatherDay => ({
      date: daily.time![index]!,
      condition: weatherCondition(daily.weather_code?.[index] ?? 3),
      max: Math.round(daily.temperature_2m_max?.[index] ?? temperature),
      min: Math.round(daily.temperature_2m_min?.[index] ?? temperature),
      precipitationChance: daily.precipitation_probability_max?.[index] ?? null
    });

    return {
      location,
      current: { temperature: Math.round(temperature), condition: weatherCondition(current.weather_code), isDay: current.is_day !== 0 },
      today: day(0),
      tomorrow: day(1),
      updatedAt: new Date().toISOString()
    };
  }

  public async searchPlaces(query: string): Promise<WeatherLocation[]> {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.search = new URLSearchParams({ name: query, count: "6", language: "it", format: "json" }).toString();
    const payload = (await this.get(url.toString())) as GeocodingPayload;
    return (payload.results ?? []).map((place) => ({
      name: [...new Set([place.name, place.admin1, place.country].filter((part): part is string => Boolean(part)))].join(", "),
      latitude: place.latitude,
      longitude: place.longitude
    }));
  }

  private async get(url: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new WeatherError(`Servizio meteo non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
      throw new WeatherError(`Il servizio meteo ha risposto HTTP ${response.status}.`);
    }
    return response.json();
  }
}
