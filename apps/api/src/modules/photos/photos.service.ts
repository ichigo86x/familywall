import { existsSync } from "node:fs";
import path from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import type { PhotoSettings, ScreensaverPhotoResponse } from "@familywall/shared";
import type { SecretBox } from "../../common/crypto/secret-box";
import { AppException } from "../../common/errors/app-exception";
import { SettingsRepository } from "../settings/settings.repository";
import { PhotoSourceError, folderPhotos, icloudAlbumPhotos, unsplashPhotos, type SourcePhoto } from "./photo-sources";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** The list of photos of a source is read again after this time (Unsplash allows 50 requests per hour in demo mode). */
const POOL_TTL_MS = 30 * 60 * 1000;
const UNSPLASH_KEY = "unsplashAccessKey";

/** Photos of the screensaver: one at a time, in random order without repeating until the list is over. */
@Injectable()
export class PhotosService {
  private readonly logger = new Logger("Photos");
  private pool: { key: string; at: number; photos: SourcePhoto[]; order: number[] } | null = null;
  private loading: Promise<SourcePhoto[]> | null = null;

  public constructor(
    private readonly settings: SettingsRepository,
    private readonly secrets: SecretBox,
    private readonly mediaDir: string,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => Date = () => new Date()
  ) {}

  public unsplashKeySet(): boolean {
    return this.settings.secret(UNSPLASH_KEY) !== null;
  }

  public setUnsplashKey(accessKey: string | null): void {
    this.settings.setSecret(UNSPLASH_KEY, accessKey ? this.secrets.encrypt(accessKey) : null);
    this.pool = null;
  }

  private unsplashKey(): string | null {
    const stored = this.settings.secret(UNSPLASH_KEY);
    try {
      return stored ? this.secrets.decrypt(stored) : null;
    } catch {
      return null;
    }
  }

  private async load(config: PhotoSettings): Promise<SourcePhoto[]> {
    switch (config.source) {
      case "unsplash": {
        const key = this.unsplashKey();
        if (!key) {
          throw new PhotoSourceError("Manca la chiave di accesso di Unsplash.");
        }
        return unsplashPhotos(this.fetchImpl, key, this.now());
      }
      case "folder":
        return folderPhotos(this.mediaDir, config.folder);
      case "icloud":
        if (!config.icloudAlbum) {
          throw new PhotoSourceError("Manca il link dell'album condiviso.");
        }
        return icloudAlbumPhotos(this.fetchImpl, config.icloudAlbum);
      default:
        return [];
    }
  }

  /** The next photo; null with no source or when the source fails (the seasonal scene is shown instead). */
  public async next(): Promise<ScreensaverPhotoResponse> {
    const config = this.settings.get().photos;
    if (config.source === "none") {
      return { photo: null, intervalSeconds: config.intervalSeconds };
    }
    let photos: SourcePhoto[];
    try {
      photos = await this.photos(config);
    } catch (error) {
      this.logger.warn(`Screensaver photos not available: ${error instanceof Error ? error.message : String(error)}`);
      return { photo: null, intervalSeconds: config.intervalSeconds };
    }
    const pool = this.pool!;
    if (photos.length === 0) {
      return { photo: null, intervalSeconds: config.intervalSeconds };
    }
    if (pool.order.length === 0) {
      pool.order = shuffle(photos.map((_, index) => index));
    }
    const photo = photos[pool.order.shift()!]!;
    if (photo.downloadLocation) {
      void this.reportUnsplashView(photo.downloadLocation);
    }
    return {
      photo: photo.file
        ? { url: `api/photos/file?name=${encodeURIComponent(photo.file)}`, viaApi: true, credit: null }
        : { url: photo.url!, viaApi: false, credit: photo.credit },
      intervalSeconds: config.intervalSeconds
    };
  }

  /** Tries the current settings now: how many photos the source gives, or why it fails. */
  public async test(): Promise<{ count: number }> {
    const config = this.settings.get().photos;
    this.pool = null;
    try {
      return { count: (await this.photos(config)).length };
    } catch (error) {
      throw AppException.providerError(error instanceof Error ? error.message : "Foto non disponibili.");
    }
  }

  /** Absolute path of a photo of the media folder, only if it is one of the photos of the current source. */
  public file(name: string): string {
    const config = this.settings.get().photos;
    const listed = config.source === "folder" && this.pool?.photos.some((photo) => photo.file === name);
    const full = path.resolve(this.mediaDir, name);
    if (!listed || !full.startsWith(path.resolve(this.mediaDir) + path.sep) || !existsSync(full)) {
      throw AppException.notFound("Foto non trovata.");
    }
    return full;
  }

  private async photos(config: PhotoSettings): Promise<SourcePhoto[]> {
    const key = JSON.stringify([config.source, config.folder, config.icloudAlbum]);
    if (this.pool && this.pool.key === key && this.now().getTime() - this.pool.at < POOL_TTL_MS) {
      return this.pool.photos;
    }
    this.loading ??= this.load(config).finally(() => (this.loading = null));
    const photos = await this.loading;
    this.pool = { key, at: this.now().getTime(), photos, order: [] };
    return photos;
  }

  private async reportUnsplashView(downloadLocation: string): Promise<void> {
    const key = this.unsplashKey();
    if (!key) {
      return;
    }
    await this.fetchImpl(downloadLocation, { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(10_000) })
      .then((response) => response.text())
      .catch(() => undefined);
  }
}

const shuffle = (values: number[]): number[] => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other]!, values[index]!];
  }
  return values;
};
