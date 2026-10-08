import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import type {
  AuthSession,
  CurrentUserResponse,
  LoginInput,
  SetupInput,
  SetupStatusResponse,
  TotpDisableInput,
  TotpEnabledResponse,
  TotpEnableInput,
  TotpSetupResponse
} from "@familywall/shared";
import { loginSchema, setupSchema, totpDisableSchema, totpEnableSchema } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import type { Request } from "express";
import { Public } from "../../common/auth/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { AuthService } from "./auth.service";
import { TotpService } from "./totp.service";

@Controller("auth")
export class AuthController {
  public constructor(
    private readonly authService: AuthService,
    private readonly totp: TotpService
  ) {}

  @Public()
  @Get("setup")
  public setupStatus(): SetupStatusResponse {
    return { needsSetup: this.authService.needsSetup() };
  }

  @Public()
  @Post("setup")
  public setup(@Body(new ZodValidationPipe(setupSchema)) input: SetupInput): Promise<AuthSession> {
    return this.authService.setup(input);
  }

  @Public()
  @Post("login")
  public login(@Req() request: Request, @Body(new ZodValidationPipe(loginSchema)) input: LoginInput): Promise<AuthSession> {
    return this.authService.login(input, request.ip ?? "unknown");
  }

  /** Two-step sign-in, for the signed-in member: new secret, first code, turning it off. */
  @Post("totp/setup")
  public totpSetup(@Req() request: RequestWithUser): TotpSetupResponse {
    return this.totp.setup(request.user.id);
  }

  @Post("totp/enable")
  public totpEnable(@Req() request: RequestWithUser, @Body(new ZodValidationPipe(totpEnableSchema)) input: TotpEnableInput): TotpEnabledResponse {
    return this.totp.enable(request.user.id, input.code);
  }

  @Post("totp/disable")
  @HttpCode(HttpStatus.NO_CONTENT)
  public async totpDisable(@Req() request: RequestWithUser, @Body(new ZodValidationPipe(totpDisableSchema)) input: TotpDisableInput): Promise<void> {
    await this.totp.disable(request.user.id, input.password, input.code);
  }

  /** For a member who lost the phone and the recovery codes. */
  @Post("totp/reset/:memberId")
  @RequirePermission("members:manage")
  @HttpCode(HttpStatus.NO_CONTENT)
  public totpReset(@Param("memberId") memberId: string): void {
    this.totp.reset(memberId);
  }

  @Get("me")
  public me(@Req() request: RequestWithUser): CurrentUserResponse {
    return { user: request.user };
  }
}
