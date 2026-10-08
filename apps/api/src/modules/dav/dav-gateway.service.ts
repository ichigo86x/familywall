import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { createHash } from "node:crypto";
import http from "node:http";
import type { Request, Response } from "express";
import { hasPermission, type Permission, type UserRole } from "@familywall/shared";
import { verifyPassword } from "../../common/crypto/password";
import { appConfig } from "../../config/app-config";
import { LoginThrottle } from "../auth/login-throttle";
import { MembersRepository, NO_PASSWORD } from "../members/members.repository";
import { DAV_FAMILY_USER, RadicaleProcess } from "./radicale-process";

/** Path under which the CalDAV server is exposed (behind any proxy prefix). */
export const DAV_PATH = "/dav";
/** A successful check is reused for a while: iOS sends many requests and scrypt is slow on purpose. */
const AUTH_CACHE_MS = 10 * 60 * 1000;

/** Methods that change data on the server. */
const WRITE_METHODS = new Set(["PUT", "DELETE", "MOVE", "COPY", "PROPPATCH", "MKCALENDAR", "MKCOL", "LOCK", "UNLOCK"]);
/** Collections of family data and the permission needed to change their items (lists need lists:write, checked at login). */
const COLLECTION_PERMISSIONS: Record<string, Permission> = {
  "familywall-menu": "events:write",
  "familywall-compleanni": "events:write",
  "familywall-turni": "events:write",
  "familywall-note": "lists:write"
};

/**
 * Same rules as the app: Children may tick lists and write notes but not change menu, birthdays
 * or shifts; only the Admin may delete, rename or recreate the family collections themselves.
 */
export const davWriteAllowed = (role: UserRole, method: string, davPath: string): boolean => {
  if (!WRITE_METHODS.has(method.toUpperCase())) {
    return true;
  }
  const segments = davPath.split("?")[0]!.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const collection = segments[1];
  if (!collection) {
    return role === "Admin";
  }
  const permission = COLLECTION_PERMISSIONS[collection];
  if (!permission) {
    return hasPermission(role, "lists:write");
  }
  return segments.length <= 2 ? role === "Admin" : hasPermission(role, permission);
};

/** Hop-by-hop or security-sensitive headers never forwarded to Radicale. */
const DROPPED_HEADERS = new Set(["authorization", "host", "connection", "x-remote-user", "x-script-name", "cookie"]);

/**
 * CalDAV gateway for iOS Reminders: authenticates Familywall members with HTTP Basic
 * (same username and password as the app) and forwards to the local Radicale, where
 * every member shares the family's lists.
 */
@Injectable()
export class DavGatewayService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DavGatewayService.name);
  private readonly radicale = new RadicaleProcess(appConfig.radicaleCommand, appConfig.radicalePort, appConfig.dataDir);
  private readonly throttle = new LoginThrottle(10, 15 * 60 * 1000);
  private readonly verified = new Map<string, number>();

  public constructor(private readonly members: MembersRepository) {}

  public onModuleInit(): void {
    this.radicale.start();
  }

  public onApplicationShutdown(): void {
    this.radicale.stop();
  }

  public get enabled(): boolean {
    return this.radicale.enabled;
  }

  public get radicaleUrl(): string {
    return this.radicale.baseUrl;
  }

  /** Express middleware for /dav and /.well-known/caldav (registered before the SPA fallback). */
  public async handle(request: Request, response: Response): Promise<void> {
    const prefix = this.forwardedPrefix(request);

    if (request.path.startsWith("/.well-known/caldav") || request.path.startsWith("/.well-known/carddav")) {
      response.redirect(301, `${prefix}${DAV_PATH}/`);
      return;
    }
    if (!this.enabled) {
      response.status(503).send("CalDAV non attivo.");
      return;
    }

    const member = await this.authenticate(request);
    if (!member) {
      response.setHeader("WWW-Authenticate", 'Basic realm="Familywall", charset="UTF-8"');
      response.status(401).send("Accesso richiesto.");
      return;
    }
    const davPath = request.originalUrl.slice(request.originalUrl.indexOf(DAV_PATH) + DAV_PATH.length) || "/";
    if (!davWriteAllowed(member.role, request.method, davPath)) {
      this.logger.warn(`CalDAV ${request.method} on ${davPath} refused for "${member.username}" (${member.role})`);
      response.status(403).send("Non hai il permesso di modificare questo calendario.");
      return;
    }

    this.forward(request, response, `${prefix}${DAV_PATH}`);
  }

  /** Members that can write lists (Admin, Parent, Child) may sync them; panels and tag-only members cannot. */
  private async authenticate(request: Request): Promise<{ username: string; role: UserRole } | null> {
    const header = request.headers.authorization ?? "";
    if (!header.startsWith("Basic ")) {
      return null;
    }
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    const username = decoded.slice(0, separator).trim().toLowerCase();
    const password = decoded.slice(separator + 1);

    const member = this.members.findByUsername(username);
    const cacheKey = createHash("sha256").update(`${username}\u0000${password}\u0000${member?.password_hash ?? ""}\u0000${member?.token_version ?? ""}`).digest("hex");
    const cachedUntil = this.verified.get(cacheKey);
    const allowed = member && member.disabled === 0 && member.password_hash !== NO_PASSWORD && hasPermission(member.role, "lists:write");
    if (allowed && cachedUntil && cachedUntil > Date.now()) {
      return { username, role: member.role };
    }

    const keys = [`dav-ip:${request.ip}`, `dav-user:${username}`];
    if (this.throttle.isBlocked(keys)) {
      return null;
    }
    const valid = allowed ? await verifyPassword(password, member.password_hash) : false;
    if (!valid) {
      this.throttle.recordFailure(keys);
      this.logger.warn(`CalDAV login refused for "${username}" from ${request.ip}`);
      return null;
    }
    this.throttle.reset(keys);
    this.verified.set(cacheKey, Date.now() + AUTH_CACHE_MS);
    return { username, role: member!.role };
  }

  private forward(request: Request, response: Response, scriptName: string): void {
    const target = new URL(this.radicale.baseUrl);
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      if (value !== undefined && !DROPPED_HEADERS.has(name.toLowerCase())) {
        headers[name] = value;
      }
    }
    headers["x-remote-user"] = DAV_FAMILY_USER;
    headers["x-script-name"] = scriptName;

    const upstream = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.originalUrl.slice(request.originalUrl.indexOf(DAV_PATH) + DAV_PATH.length) || "/",
        headers
      },
      (reply) => {
        response.status(reply.statusCode ?? 502);
        for (const [name, value] of Object.entries(reply.headers)) {
          if (value !== undefined && name.toLowerCase() !== "connection") {
            response.setHeader(name, value);
          }
        }
        reply.pipe(response);
      }
    );
    upstream.on("error", (error) => {
      this.logger.warn(`CalDAV server unreachable: ${error.message}`);
      if (!response.headersSent) {
        response.status(503).send("CalDAV non disponibile.");
      } else {
        response.end();
      }
    });
    request.pipe(upstream);
  }

  /** nginx may publish Familywall under a sub-path: X-Forwarded-Prefix tells which one. */
  private forwardedPrefix(request: Request): string {
    const prefix = String(request.headers["x-forwarded-prefix"] ?? "").trim();
    return prefix.startsWith("/") ? prefix.replace(/\/+$/, "") : "";
  }
}
