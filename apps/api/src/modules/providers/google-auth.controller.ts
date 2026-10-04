import { Body, Controller, Get, Header, Post, Query } from "@nestjs/common";
import type { GoogleAuthCompleteInput, GoogleAuthStartInput, GoogleAuthStartResponse, ProviderAccountResponse } from "@familywall/shared";
import { googleAuthCompleteSchema, googleAuthStartSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { Public } from "../../common/auth/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { ProvidersService } from "./providers.service";

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const resultPage = (title: string, message: string): string => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 16px;color:#1f2933}h1{font-size:1.4rem}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;

/** Google OAuth: started from the Admin page, finished by pasting the redirect or on the callback route. */
@Controller("providers/google")
export class GoogleAuthController {
  public constructor(private readonly providersService: ProvidersService) {}

  @Post("start")
  @RequirePermission("providers:manage")
  public start(@Body(new ZodValidationPipe(googleAuthStartSchema)) input: GoogleAuthStartInput): GoogleAuthStartResponse {
    return this.providersService.startGoogleAuth(input);
  }

  @Post("complete")
  @RequirePermission("providers:manage")
  public async complete(@Body(new ZodValidationPipe(googleAuthCompleteSchema)) input: GoogleAuthCompleteInput): Promise<ProviderAccountResponse> {
    return { account: await this.providersService.completeGoogleAuth(input) };
  }

  /**
   * Redirect target for "Web application" OAuth clients that register this URL
   * (e.g. https://familywall.example.com/api/providers/google/callback). Public because
   * the browser arrives from Google without the app token; the one-time state ties it
   * to an authorisation an Admin started.
   */
  @Get("callback")
  @Public()
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  public async callback(@Query() query: Record<string, string>): Promise<string> {
    const params = new URLSearchParams(query);
    try {
      const account = await this.providersService.completeGoogleAuth({ state: query.state ?? "", redirectedUrl: `callback?${params.toString()}` });
      return resultPage("Account Google collegato", `${account.label} è collegato. Torna su Familywall e scegli calendari e liste.`);
    } catch (error) {
      return resultPage("Collegamento non riuscito", error instanceof Error ? error.message : "Errore sconosciuto.");
    }
  }
}
