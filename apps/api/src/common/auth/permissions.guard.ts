import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { userCan, type Permission } from "@familywall/shared";
import { AppException } from "../errors/app-exception";
import { PERMISSION_KEY } from "./permissions.decorator";
import type { RequestWithUser } from "../types/request-with-user";

/** Runs after JwtAuthGuard, so request.user is set on every non-public route. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  public canActivate(context: ExecutionContext): boolean {
    const permission =
      (Reflect.getMetadata(PERMISSION_KEY, context.getHandler()) as Permission | undefined) ??
      (Reflect.getMetadata(PERMISSION_KEY, context.getClass()) as Permission | undefined);

    if (!permission) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !userCan(user, permission)) {
      throw AppException.forbidden("Non hai i permessi per questa operazione.");
    }

    return true;
  }
}
