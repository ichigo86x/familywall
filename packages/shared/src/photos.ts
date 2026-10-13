import { z } from "zod";

/** Where the screensaver photos come from ("none": the animated seasonal scene). */
export type PhotoSource = "none" | "unsplash" | "folder" | "icloud";

export interface PhotoSettings {
  source: PhotoSource;
  /** Folder inside the media folder of Home Assistant (/media), e.g. "Famiglia". */
  folder: string | null;
  /** Public link of an iCloud shared album (https://www.icloud.com/sharedalbum/#...). */
  icloudAlbum: string | null;
  /** Seconds each photo stays on screen. */
  intervalSeconds: number;
}

export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = { source: "none", folder: null, icloudAlbum: null, intervalSeconds: 60 };

export const photoSettingsSchema = z.object({
  source: z.enum(["none", "unsplash", "folder", "icloud"]),
  folder: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value.split(/[\/]/).includes(".."), "Cartella non valida")
    .nullable()
    .default(null),
  icloudAlbum: z
    .string()
    .trim()
    .regex(/^https:\/\/(www\.)?icloud\.com\/sharedalbum\/[^#]*#[A-Za-z0-9]+$/, "Usa il link pubblico dell'album condiviso (https://www.icloud.com/sharedalbum/#...)")
    .nullable()
    .default(null),
  intervalSeconds: z.number().int().min(10).max(3600).default(60)
});

/** A photo to show: a public URL, or a file of the media folder read through the API (authenticated). */
export interface ScreensaverPhoto {
  url: string;
  /** True when the URL is an API path that needs the session token. */
  viaApi: boolean;
  /** Photographer to credit (Unsplash). */
  credit: { name: string; link: string } | null;
}

export interface ScreensaverPhotoResponse {
  photo: ScreensaverPhoto | null;
  intervalSeconds: number;
}

export interface PhotoSourceStatus {
  unsplashKeySet: boolean;
}

export const unsplashKeySchema = z.object({ accessKey: z.string().trim().max(200).nullable() });
