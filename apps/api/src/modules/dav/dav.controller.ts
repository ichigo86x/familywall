import { Body, Controller, Get, Header, Post, Query, Req, Res } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { Public } from "../../common/auth/public.decorator";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { DAV_PATH, DavGatewayService } from "./dav-gateway.service";
import { DAV_FAMILY_USER } from "./radicale-process";

/** Long enough to tap "Consenti" in Safari and open Impostazioni. */
const LINK_TTL_MS = 10 * 60 * 1000;

const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** iOS configuration profile with a CalDAV account (password asked by iOS, never embedded). */
const caldavProfile = (input: { host: string; port: number; ssl: boolean; principalPath: string; username: string }): string => {
  const accountId = randomUUID().toUpperCase();
  const profileId = randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>CalDAVAccountDescription</key><string>Familywall</string>
      <key>CalDAVHostName</key><string>${escapeXml(input.host)}</string>
      <key>CalDAVPort</key><integer>${input.port}</integer>
      <key>CalDAVPrincipalURL</key><string>${escapeXml(input.principalPath)}</string>
      <key>CalDAVUseSSL</key><${input.ssl ? "true" : "false"}/>
      <key>CalDAVUsername</key><string>${escapeXml(input.username)}</string>
      <key>PayloadDescription</key><string>Liste, menu, compleanni e turni della famiglia</string>
      <key>PayloadDisplayName</key><string>Familywall Promemoria</string>
      <key>PayloadIdentifier</key><string>familywall.caldav.${accountId}</string>
      <key>PayloadType</key><string>com.apple.caldav.account</string>
      <key>PayloadUUID</key><string>${accountId}</string>
      <key>PayloadVersion</key><integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>Familywall</string>
  <key>PayloadIdentifier</key><string>familywall.profile.${profileId}</string>
  <key>PayloadOrganization</key><string>Familywall</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>${profileId}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>
`;
};

/**
 * Helps members add the family lists to iOS Reminders. The profile is downloaded through
 * a short-lived link, because Safari must open it by plain navigation (no token header).
 * The link works several times until it expires: Safari downloads the profile again after
 * "Consenti", and the profile holds no password (iOS asks for it).
 */
@Controller("dav")
export class DavController {
  private readonly links = new Map<string, { username: string; expiresAt: number; baseUrl?: URL }>();

  public constructor(private readonly gateway: DavGatewayService) {}

  @Get("info")
  @RequirePermission("lists:write")
  public info(@Req() request: RequestWithUser): { enabled: boolean; path: string; username: string } {
    return { enabled: this.gateway.enabled, path: `${DAV_PATH}/${DAV_FAMILY_USER}/`, username: request.user.username };
  }

  @Post("profile-link")
  @RequirePermission("lists:write")
  public profileLink(@Req() request: RequestWithUser, @Body() body: { baseUrl?: unknown }): { token: string } {
    const now = Date.now();
    for (const [token, link] of this.links) {
      if (link.expiresAt < now) {
        this.links.delete(token);
      }
    }
    // The browser knows the public address (e.g. https://host:8443/); proxies often hide the port.
    let baseUrl: URL | undefined;
    try {
      baseUrl = typeof body?.baseUrl === "string" ? new URL(body.baseUrl) : undefined;
    } catch {
      baseUrl = undefined;
    }
    const token = randomBytes(24).toString("base64url");
    this.links.set(token, {
      username: request.user.username,
      expiresAt: now + LINK_TTL_MS,
      baseUrl: baseUrl && /^https?:$/.test(baseUrl.protocol) ? baseUrl : undefined
    });
    return { token };
  }

  @Get("profile")
  @Public()
  @Header("Cache-Control", "no-store")
  public profile(@Query("t") token: string, @Req() request: Request, @Res() response: Response): void {
    const link = token ? this.links.get(token) : undefined;
    if (!link || link.expiresAt < Date.now()) {
      response.status(410).type("text/plain").send("Link scaduto: generane uno nuovo da Familywall.");
      return;
    }
    let host: string;
    let port: number;
    let ssl: boolean;
    let prefix: string;
    if (link.baseUrl) {
      ssl = link.baseUrl.protocol === "https:";
      host = link.baseUrl.hostname;
      port = link.baseUrl.port ? Number(link.baseUrl.port) : ssl ? 443 : 80;
      prefix = link.baseUrl.pathname.replace(/\/+$/, "");
    } else {
      const forwardedHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
      const hostHeader = forwardedHost || request.headers.host || "localhost";
      ssl = request.protocol === "https";
      const [hostName, portText] = hostHeader.split(":");
      host = hostName!;
      port = portText ? Number(portText) : ssl ? 443 : 80;
      prefix = String(request.headers["x-forwarded-prefix"] ?? "").replace(/\/+$/, "");
    }

    // Plain bytes with the exact profile type (no charset): Safari then offers to install it.
    const body = Buffer.from(caldavProfile({ host, port, ssl, principalPath: `${prefix}${DAV_PATH}/${DAV_FAMILY_USER}/`, username: link.username }), "utf8");
    response.status(200);
    response.setHeader("Content-Type", "application/x-apple-aspen-config");
    response.setHeader("Content-Disposition", 'inline; filename="familywall-promemoria.mobileconfig"');
    response.setHeader("Content-Length", String(body.length));
    response.end(body);
  }
}
