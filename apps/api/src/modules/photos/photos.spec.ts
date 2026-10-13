import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SecretBox } from "../../common/crypto/secret-box";
import { openDatabase } from "../../database/database";
import { SettingsRepository } from "../settings/settings.repository";
import { icloudAlbumPhotos } from "./photo-sources";
import { PhotosService } from "./photos.service";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const setup = (fetchImpl: (url: string, init: RequestInit) => Promise<Response> = async () => json([])) => {
  const media = mkdtempSync(path.join(tmpdir(), "fw-media-"));
  const settings = new SettingsRepository(openDatabase(":memory:"));
  const service = new PhotosService(settings, new SecretBox(randomBytes(32)), media, fetchImpl, () => new Date("2026-10-13T10:00:00Z"));
  return { media, settings, service };
};

describe("PhotosService", () => {
  it("shows the photos of a media folder, every one before repeating, and serves only those", async () => {
    const { media, settings, service } = setup();
    mkdirSync(path.join(media, "Famiglia", "Mare"), { recursive: true });
    writeFileSync(path.join(media, "Famiglia", "a.jpg"), "x");
    writeFileSync(path.join(media, "Famiglia", "Mare", "b.PNG"), "x");
    writeFileSync(path.join(media, "Famiglia", "note.txt"), "x");
    writeFileSync(path.join(media, "segreto.jpg"), "x");
    settings.update({ photos: { source: "folder", folder: "Famiglia", icloudAlbum: null, intervalSeconds: 30 } });

    const first = await service.next();
    const second = await service.next();
    const names = [first, second].map((entry) => decodeURIComponent(entry.photo!.url.split("name=")[1]!)).sort();
    expect(names).toEqual(["Famiglia/Mare/b.PNG", "Famiglia/a.jpg"]);
    expect(first).toMatchObject({ intervalSeconds: 30, photo: { viaApi: true, credit: null } });
    expect(service.file("Famiglia/a.jpg")).toBe(path.join(media, "Famiglia", "a.jpg"));
    expect(() => service.file("segreto.jpg")).toThrow(/non trovata/);
    expect(() => service.file("../../etc/passwd")).toThrow(/non trovata/);
  });

  it("asks Unsplash for seasonal photos with the stored key, credits and reports them", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const { settings, service } = setup(async (url, init) => {
      calls.push({ url, init });
      return url.includes("/photos/random")
        ? json([{ id: "p1", urls: { raw: "https://images.unsplash.com/p1?ixid=1" }, user: { name: "Ada", links: { html: "https://unsplash.com/@ada" } }, links: { download_location: "https://api.unsplash.com/photos/p1/download" } }])
        : json({});
    });
    settings.update({ photos: { source: "unsplash", folder: null, icloudAlbum: null, intervalSeconds: 60 } });
    expect((await service.next()).photo).toBeNull();

    service.setUnsplashKey("chiave");
    expect(service.unsplashKeySet()).toBe(true);
    expect(JSON.stringify(settings.get())).not.toContain("chiave");
    const { photo } = await service.next();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls[0]!.url).toContain("query=autumn+landscape+leaves");
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: "Client-ID chiave" });
    expect(photo).toEqual({ url: "https://images.unsplash.com/p1?ixid=1&w=1920&q=80&fm=jpg&fit=max", viaApi: false, credit: { name: "Ada", link: "https://unsplash.com/@ada?utm_source=familywall&utm_medium=referral" } });
    expect(calls.at(-1)!.url).toBe("https://api.unsplash.com/photos/p1/download");
  });

  it("reads a public iCloud shared album, following the server it names", async () => {
    const hosts: string[] = [];
    const photos = await icloudAlbumPhotos(async (url, init) => {
      hosts.push(new URL(url).host);
      if (url.startsWith("https://p23-")) {
        return json({ "X-Apple-MMe-Host": "p99-sharedstreams.icloud.com" }, 330);
      }
      if (url.endsWith("/webstream")) {
        return json({ photos: [{ photoGuid: "g1", derivatives: { "1": { checksum: "small", width: "640" }, "2": { checksum: "big", width: "2048" }, "3": { checksum: "huge", width: "4032" } } }] });
      }
      expect(JSON.parse(String(init.body))).toEqual({ photoGuids: ["g1"] });
      return json({ items: { big: { url_location: "cvws.icloud-content.com", url_path: "/B/abc" } } });
    }, "https://www.icloud.com/sharedalbum/#B0aTOKEN");

    expect(hosts).toEqual(["p23-sharedstreams.icloud.com", "p99-sharedstreams.icloud.com", "p99-sharedstreams.icloud.com"]);
    expect(photos).toMatchObject([{ id: "icloud-g1", url: "https://cvws.icloud-content.com/B/abc" }]);
  });
});
