import { Controller, Get, Query } from "@nestjs/common";
import type { AuditLogResponse } from "@familywall/shared";
import { RequirePermission } from "../../common/auth/permissions.decorator";
import { AuditRepository } from "./audit.repository";

/** The activity log, for the Admin. */
@Controller("audit")
export class AuditController {
  public constructor(private readonly audit: AuditRepository) {}

  @Get()
  @RequirePermission("settings:manage")
  public list(@Query("before") before?: string, @Query("limit") limit?: string): AuditLogResponse {
    const beforeId = before && /^\d+$/.test(before) ? Number(before) : null;
    const size = Math.min(Math.max(Number(limit) || 100, 1), 500);
    return this.audit.list(beforeId, size);
  }
}
