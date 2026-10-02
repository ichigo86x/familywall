import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@familywall/shared";

export const PERMISSION_KEY = "permission";

/** Routes without this decorator only require a valid session. */
export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, permission);
