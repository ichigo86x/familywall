import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { unsplashKeySchema, type PhotoSourceStatus, type ScreensaverPhotoResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { PhotosService } from "./photos.service";

/** Screensaver photos: the next one for the panels, the source settings for the Admin. */
@Controller("photos")
export class PhotosController {
  public constructor(private readonly photos: PhotosService) {}

  @Get("next")
  @RequirePermission("calendar:read")
  public next(): Promise<ScreensaverPhotoResponse> {
    return this.photos.next();
  }

  /** A photo of the media folder (img tags cannot send the token: the page reads it and shows a blob). */
  @Get("file")
  @RequirePermission("calendar:read")
  public file(@Query("name") name: string, @Res() response: Response): void {
    response.setHeader("Cache-Control", "private, max-age=3600");
    response.sendFile(this.photos.file(String(name ?? "")));
  }

  @Get("status")
  @RequirePermission("settings:manage")
  public status(): PhotoSourceStatus {
    return { unsplashKeySet: this.photos.unsplashKeySet() };
  }

  @Put("unsplash-key")
  @RequirePermission("settings:manage")
  @HttpCode(HttpStatus.NO_CONTENT)
  public setUnsplashKey(@Body(new ZodValidationPipe(unsplashKeySchema)) input: { accessKey: string | null }): void {
    this.photos.setUnsplashKey(input.accessKey?.trim() || null);
  }

  @Post("test")
  @RequirePermission("settings:manage")
  public test(): Promise<{ count: number }> {
    return this.photos.test();
  }
}
