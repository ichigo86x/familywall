import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type {
  AuthSession,
  CurrentUserResponse,
  LoginInput,
  SetupInput,
  SetupStatusResponse
} from "@familywall/shared";
import { loginSchema, setupSchema } from "@familywall/shared";
import type { Request } from "express";
import { Public } from "../../common/auth/public.decorator";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { RequestWithUser } from "../../common/types/request-with-user";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  public constructor(private readonly authService: AuthService) {}

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

  @Get("me")
  public me(@Req() request: RequestWithUser): CurrentUserResponse {
    return { user: request.user };
  }
}
