import { Controller, Get, Header, Post, Query, Req, Res } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { Public } from "../../common/auth/public.decorator";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { DAV_PATH, DavGatewayService } from "./dav-gateway.service";
import { DAV_FAMILY_USER } from "./radicale-process";

const LINK_TTL_MS = 5 * 60 * 1000;

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
      <key>PayloadDescription</key><string>Liste della famiglia nei Promemoria</string>
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
 * a short-lived one-time link, because Safari must open it by plain navigation (no token header).
 */
@Controller("dav")
export class DavController {
  private readonly links = new Map<string, { username: string; expiresAt: number }>();

  public constructor(private readonly gateway: DavGatewayService) {}

  @Get("info")
  @RequirePermission("lists:write")
  public info(@Req() request: RequestWithUser): { enabled: boolean; path: string; username: string } {
    return { enabled: this.gateway.enabled, path: `${DAV_PATH}/${DAV_FAMILY_USER}/`, username: request.user.username };
  }

  @Post("profile-link")
  @RequirePermission("lists:write")
  public profileLink(@Req() request: RequestWithUser): { token: string } {
    const now = Date.now();
    for (const [token, link] of this.links) {
      if (link.expiresAt < now) {
        this.links.delete(token);
      }
    }
    const token = randomBytes(24).toString("base64url");
    this.links.set(token, { username: request.user.username, expiresAt: now + LINK_TTL_MS });
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
    this.links.delete(token);

    const forwardedHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
    const hostHeader = forwardedHost || request.headers.host || "localhost";
    const ssl = request.protocol === "https";
    const [host, portText] = hostHeader.split(":");
    const port = portText ? Number(portText) : ssl ? 443 : 80;
    const prefix = String(request.headers["x-forwarded-prefix"] ?? "").replace(/\/+$/, "");

    response
      .status(200)
      .type("application/x-apple-aspen-config")
      .setHeader("Content-Disposition", 'attachment; filename="familywall-promemoria.mobileconfig"')
      .send(caldavProfile({ host: host!, port, ssl, principalPath: `${prefix}${DAV_PATH}/${DAV_FAMILY_USER}/`, username: link.username }));
  }
}
