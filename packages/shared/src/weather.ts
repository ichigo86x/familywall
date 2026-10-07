/** Place used for the dashboard weather (chosen by the Admin). */
export interface WeatherLocation {
  /** Display name, e.g. "Milano, Lombardia". */
  name: string;
  latitude: number;
  longitude: number;
}

export type WeatherCondition = "clear" | "partly-cloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export interface WeatherDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  condition: WeatherCondition;
  max: number;
  min: number;
  /** Highest chance of precipitation in the day (0-100), when known. */
  precipitationChance: number | null;
}

export interface WeatherReport {
  location: WeatherLocation;
  current: { temperature: number; condition: WeatherCondition; isDay: boolean };
  today: WeatherDay;
  tomorrow: WeatherDay;
  updatedAt: string;
}

export interface WeatherResponse {
  /** Null when no place is configured. */
  weather: WeatherReport | null;
}

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  clear: "Sereno",
  "partly-cloudy": "Poco nuvoloso",
  cloudy: "Nuvoloso",
  fog: "Nebbia",
  drizzle: "Pioviggine",
  rain: "Pioggia",
  snow: "Neve",
  storm: "Temporale"
};

/** Maps WMO weather codes (used by Open-Meteo) to a few conditions the UI can draw. */
export const weatherCondition = (code: number): WeatherCondition => {
  if (code === 0 || code === 1) return "clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
};
