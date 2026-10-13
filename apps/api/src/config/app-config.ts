import { existsSync } from "node:fs";
import path from "node:path";
import { quoteCommandPart } from "./command-line";

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dataDir: string;
  /** Media folder of Home Assistant (/media in the add-on): screensaver photos can come from it. */
  mediaDir: string;
  /** Built SPA served by the API in production; empty disables static serving. */
  webDistDir: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtExpiresIn: string;
  /** Extra origins allowed by CORS. Same-origin requests never need this. */
  corsOrigins: string[];
  /** Built-in CalDAV server (Radicale) for iOS Reminders; disabled when empty. */
  radicaleCommand: string;
  radicalePort: number;
  icloudPython: string;
  icloudBridgePort: number;
  /** Home Assistant REST API: the Supervisor proxy inside the add-on, or HA_URL with a long-lived HA_TOKEN. */
  homeAssistant: { url: string; token: string } | null;
}

/** Python of the development venv made by `npm run python:setup` (apps/api/.venv, Radicale and pyicloud), when present. */
const devVenvPython = (): string | null => {
  const venv = path.resolve(__dirname, "..", "..", ".venv");
  const candidates = [path.join(venv, "Scripts", "python.exe"), path.join(venv, "bin", "python")];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const readList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const loadAppConfig = (): AppConfig => {
  const venvPython = devVenvPython();
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const isDevelopment = nodeEnv !== "production";

  return {
    nodeEnv,
    port: Number(process.env.PORT ?? 3001),
    dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
    mediaDir: path.resolve(process.env.MEDIA_DIR ?? (process.env.SUPERVISOR_TOKEN ? "/media" : "./media")),
    webDistDir: process.env.WEB_DIST_DIR ? path.resolve(process.env.WEB_DIST_DIR) : "",
    jwtIssuer: process.env.JWT_ISSUER ?? "familywall-api",
    jwtAudience: process.env.JWT_AUDIENCE ?? "familywall-web",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "30d",
    corsOrigins: process.env.CORS_ORIGINS
      ? readList(process.env.CORS_ORIGINS)
      : isDevelopment
        ? ["http://localhost:5173"]
        : [],
    // e.g. "python3 -m radicale" in the add-on; set RADICALE_COMMAND="" to disable.
    radicaleCommand: process.env.RADICALE_COMMAND ?? `${venvPython ? quoteCommandPart(venvPython) : "python3"} -m radicale`,
    radicalePort: Number(process.env.RADICALE_PORT ?? 5232),
    // Python with pyicloud for iCloud Reminders (Apple ID login); set ICLOUD_PYTHON="" to disable.
    icloudPython: process.env.ICLOUD_PYTHON ?? (venvPython ? quoteCommandPart(venvPython) : "python3"),
    icloudBridgePort: Number(process.env.ICLOUD_BRIDGE_PORT ?? 5234),
    homeAssistant: process.env.SUPERVISOR_TOKEN
      ? { url: "http://supervisor/core/api", token: process.env.SUPERVISOR_TOKEN }
      : process.env.HA_URL && process.env.HA_TOKEN
        ? { url: `${process.env.HA_URL.replace(/\/+$/, "")}/api`, token: process.env.HA_TOKEN }
        : null
  };
};

export const appConfig = loadAppConfig();
