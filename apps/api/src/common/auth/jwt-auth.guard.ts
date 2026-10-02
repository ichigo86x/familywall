import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "../../modules/auth/auth.service";
import { AppException } from "../errors/app-exception";
import { IS_PUBLIC_KEY } from "./public.decorator";
import type { RequestWithUser } from "../types/request-with-user";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public canActivate(context: ExecutionContext): boolean {
    const isPublic =
      Reflect.getMetadata(IS_PUBLIC_KEY, context.getHandler()) || Reflect.getMetadata(IS_PUBLIC_KEY, context.getClass());

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      throw AppException.unauthorized("Accesso richiesto.");
    }

    request.user = this.authService.authenticateToken(authorization.slice("Bearer ".length).trim());
    return true;
  }
}
