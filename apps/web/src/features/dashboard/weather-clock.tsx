import { Card } from "@fluentui/react-components";
import { Link } from "react-router-dom";
import { WEATHER_LABELS, type WeatherCondition, type WeatherReport } from "@familywall/shared";

const ICONS: Record<WeatherCondition, { day: string; night: string }> = {
  clear: { day: "☀️", night: "🌙" },
  "partly-cloudy": { day: "⛅", night: "☁️" },
  cloudy: { day: "☁️", night: "☁️" },
  fog: { day: "🌫️", night: "🌫️" },
  drizzle: { day: "🌦️", night: "🌧️" },
  rain: { day: "🌧️", night: "🌧️" },
  snow: { day: "❄️", night: "❄️" },
  storm: { day: "⛈️", night: "⛈️" }
};

export const weatherIcon = (condition: WeatherCondition, isDay = true) => ICONS[condition][isDay ? "day" : "night"];

/** Decorations drawn by CSS for each sky: sun or moon, clouds, rain, snow, lightning. */
const SceneLayer = ({ condition, isDay }: { condition: WeatherCondition; isDay: boolean }) => {
  const clouds = condition === "clear" ? 0 : condition === "partly-cloudy" ? 2 : 3;
  return (
    <div className="weather-scene" aria-hidden="true">
      {condition === "clear" || condition === "partly-cloudy" ? <span className={isDay ? "weather-scene__sun" : "weather-scene__moon"} /> : null}
      {!isDay && (condition === "clear" || condition === "partly-cloudy") ? <span className="weather-scene__stars" /> : null}
      {Array.from({ length: clouds }, (_, index) => (
        <span key={index} className={`weather-scene__cloud weather-scene__cloud--${index + 1}`} />
      ))}
      {condition === "rain" || condition === "drizzle" || condition === "storm" ? <span className="weather-scene__rain" /> : null}
      {condition === "snow" ? <span className="weather-scene__snow" /> : null}
      {condition === "storm" ? <span className="weather-scene__flash" /> : null}
      {condition === "fog" ? <span className="weather-scene__fog" /> : null}
    </div>
  );
};

interface WeatherClockProps {
  now: Date;
  weather: WeatherReport | null;
  /** Shows the "set a city" hint (Admin only). */
  canConfigure: boolean;
}

/** Big clock on a background that matches today's weather. */
export const WeatherClock = ({ now, weather, canConfigure }: WeatherClockProps) => {
  // The sky shows the weather of the whole day (a rainy day stays rainy during a dry spell).
  const condition = weather?.today.condition;
  const isDay = weather ? weather.current.isDay : now.getHours() >= 7 && now.getHours() < 19;
  const sceneClass = condition ? `weather-sky--${condition} ${isDay ? "weather-sky--day" : "weather-sky--night"}` : "";

  return (
    <Card className={`panel-card dashboard-clock ${sceneClass}`.trim()} aria-label="Ora e meteo">
      {condition ? <SceneLayer condition={condition} isDay={isDay} /> : null}
      <div className="dashboard-clock__inner">
        <strong>{now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</strong>
        <div>
          <span>{now.toLocaleDateString("it-IT", { weekday: "long" })}</span>
          <span>{now.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        {weather ? (
          <div className="dashboard-weather">
            <span className="dashboard-weather__now">
              <span aria-hidden="true">{weatherIcon(weather.current.condition, weather.current.isDay)}</span>
              {weather.current.temperature}°
            </span>
            <span>
              {WEATHER_LABELS[weather.current.condition]} · {weather.today.max}° / {weather.today.min}°
              {weather.today.precipitationChance !== null && weather.today.precipitationChance >= 30 ? ` · pioggia ${weather.today.precipitationChance}%` : ""}
            </span>
            <span>
              Domani {weatherIcon(weather.tomorrow.condition)} {weather.tomorrow.max}° / {weather.tomorrow.min}°
            </span>
          </div>
        ) : canConfigure ? (
          <Link to="/admin" className="dashboard-weather__setup">Imposta la città per il meteo →</Link>
        ) : null}
      </div>
    </Card>
  );
};
