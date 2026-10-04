import "reflect-metadata";

import { existsSync } from "node:fs";
import path from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AppExceptionFilter } from "./common/errors/app-exception.filter";
import { appConfig } from "./config/app-config";
import { AppModule } from "./app.module";
import { DAV_PATH, DavGatewayService } from "./modules/dav/dav-gateway.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: appConfig.corsOrigins.length > 0 ? { origin: appConfig.corsOrigins } : false
  });

  // Behind nginx or Home Assistant ingress: trust one proxy hop so request.ip is the real client.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new AppExceptionFilter());

  // CalDAV for iOS Reminders: authenticated here, served by the local Radicale.
  // Registered before static files and the SPA fallback, outside the /api prefix.
  const dav = app.get(DavGatewayService);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const davRequest = request.path === DAV_PATH || request.path.startsWith(DAV_PATH + "/") || request.path.startsWith("/.well-known/caldav");
    if (davRequest) {
      void dav.handle(request, response);
      return;
    }
    next();
  });
  app.enableShutdownHooks();

  const logger = new Logger("Bootstrap");
  const indexHtml = appConfig.webDistDir ? path.join(appConfig.webDistDir, "index.html") : "";

  if (indexHtml && existsSync(indexHtml)) {
    app.useStaticAssets(appConfig.webDistDir, { index: false, maxAge: "1h" });
    // SPA fallback: anything that is not an API call or a static file gets index.html.
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method !== "GET" || request.path.startsWith("/api/")) {
        next();
        return;
      }
      response.setHeader("Cache-Control", "no-cache");
      response.sendFile(indexHtml);
    });
    logger.log(`Serving web app from ${appConfig.webDistDir}`);
  }

  await app.listen(appConfig.port);
  logger.log(`Familywall API listening on port ${appConfig.port}, data in ${appConfig.dataDir}`);
}

void bootstrap();
