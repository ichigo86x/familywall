import { readdirSync, statSync } from "node:fs";
import path from "node:path";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** A photo of a source: public URL, or a file name of the media folder. */
export interface SourcePhoto {
  id: string;
  url: string | null;
  file: string | null;
  credit: { name: string; link: string } | null;
  /** Unsplash asks to call this when the photo is shown. */
  downloadLocation: string | null;
}

export class PhotoSourceError extends Error {}

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
/** At most this many photos are read from a source at once. */
const MAX_PHOTOS = 300;

const SEASON_QUERIES = {
  winter: "winter landscape snow",
  spring: "spring flowers landscape",
  summer: "summer landscape sea",
  autumn: "autumn landscape leaves"
} as const;

export const seasonOf = (date: Date): keyof typeof SEASON_QUERIES => {
  const month = date.getMonth();
  return month <= 1 || month === 11 ? "winter" : month <= 4 ? "spring" : month <= 7 ? "summer" : "autumn";
};

const getJson = async (fetchImpl: FetchLike, url: string, init: RequestInit, what: string): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new PhotoSourceError(`${what} non raggiungibile.`);
  }
  if (!response.ok) {
    await response.text();
    throw new PhotoSourceError(
      response.status === 401 || response.status === 403 ? `${what}: chiave non valida o limite di richieste raggiunto.` : `${what}: HTTP ${response.status}.`
    );
  }
  return response.json();
};

/**
 * Seasonal landscapes from Unsplash with the family's access key (unsplash.com/developers).
 * The Unsplash guidelines ask to credit the photographer and to report each photo shown.
 */
export const unsplashPhotos = async (fetchImpl: FetchLike, accessKey: string, now: Date): Promise<SourcePhoto[]> => {
  const query = new URLSearchParams({ query: SEASON_QUERIES[seasonOf(now)], orientation: "landscape", count: "30", content_filter: "high" });
  const items = (await getJson(fetchImpl, `https://api.unsplash.com/photos/random?${query.toString()}`, { headers: { Authorization: `Client-ID ${accessKey}`, "Accept-Version": "v1" } }, "Unsplash")) as Array<{
    id: string;
    urls: { raw: string };
    user: { name: string; links: { html: string } };
    links: { download_location: string };
  }>;
  const referral = "utm_source=familywall&utm_medium=referral";
  return items.map((item) => ({
    id: `unsplash-${item.id}`,
    url: `${item.urls.raw}&w=1920&q=80&fm=jpg&fit=max`,
    file: null,
    credit: { name: item.user.name, link: `${item.user.links.html}?${referral}` },
    downloadLocation: item.links.download_location
  }));
};

/** Images of a folder inside the media folder (subfolders included), never outside it. */
export const folderPhotos = (mediaDir: string, folder: string | null): SourcePhoto[] => {
  const root = path.resolve(mediaDir, folder ?? "");
  if (root !== path.resolve(mediaDir) && !root.startsWith(path.resolve(mediaDir) + path.sep)) {
    throw new PhotoSourceError("Cartella non valida.");
  }
  const files: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      throw new PhotoSourceError(`Cartella "${folder ?? ""}" non trovata nella cartella media.`);
    }
    for (const entry of entries) {
      if (files.length >= MAX_PHOTOS) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && depth < 3 && !entry.name.startsWith(".")) {
        walk(full, depth + 1);
      } else if (entry.isFile() && IMAGE.test(entry.name) && statSync(full).size < 30 * 1024 * 1024) {
        files.push(path.relative(path.resolve(mediaDir), full).split(path.sep).join("/"));
      }
    }
  };
  walk(root, 0);
  return files.map((file) => ({ id: `file-${file}`, url: null, file, credit: null, downloadLocation: null }));
};

interface WebStream {
  photos?: Array<{ photoGuid: string; derivatives?: Record<string, { checksum: string; width?: string | number }> }>;
  "X-Apple-MMe-Host"?: string;
}

/**
 * Photos of a public iCloud shared album, through the web API used by icloud.com (not documented:
 * it may change). Links to the images last a few hours, so the list is read again from time to time.
 */
export const icloudAlbumPhotos = async (fetchImpl: FetchLike, albumUrl: string): Promise<SourcePhoto[]> => {
  const token = albumUrl.split("#").pop()!;
  const post = async (host: string, endpoint: string, body: unknown) => {
    let response: Response;
    try {
      response = await fetchImpl(`https://${host}/${token}/sharedstreams/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new PhotoSourceError("Album iCloud non raggiungibile.");
    }
    if (response.status !== 200 && response.status !== 330) {
      await response.text();
      throw new PhotoSourceError(response.status === 404 ? "Album iCloud non trovato: è pubblico?" : `Album iCloud: HTTP ${response.status}.`);
    }
    return { status: response.status, body: (await response.json()) as WebStream & { items?: Record<string, { url_location: string; url_path: string }> } };
  };

  let host = "p23-sharedstreams.icloud.com";
  let stream = await post(host, "webstream", { streamCtag: null });
  // The first answer may name the server that holds the album.
  if (stream.status === 330 && stream.body["X-Apple-MMe-Host"]) {
    host = stream.body["X-Apple-MMe-Host"];
    stream = await post(host, "webstream", { streamCtag: null });
  }
  const photos = (stream.body.photos ?? []).slice(-MAX_PHOTOS);
  if (photos.length === 0) {
    return [];
  }
  // The largest version up to 2048 pixels wide.
  const best = photos.map((photo) => {
    const versions = Object.values(photo.derivatives ?? {}).sort((left, right) => Number(right.width ?? 0) - Number(left.width ?? 0));
    return { guid: photo.photoGuid, checksum: (versions.find((version) => Number(version.width ?? 0) <= 2048) ?? versions.at(-1))?.checksum };
  });
  const assets = await post(host, "webasseturls", { photoGuids: best.map((photo) => photo.guid) });
  const items = assets.body.items ?? {};
  return best.flatMap((photo) => {
    const item = photo.checksum ? items[photo.checksum] : undefined;
    return item ? [{ id: `icloud-${photo.guid}`, url: `https://${item.url_location}${item.url_path}`, file: null, credit: null, downloadLocation: null }] : [];
  });
};
