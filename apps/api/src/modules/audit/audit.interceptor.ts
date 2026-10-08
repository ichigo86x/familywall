import { HttpException, Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { tap, type Observable } from "rxjs";
import type { User } from "@familywall/shared";
import { AUDITED_READS, auditAction } from "./audit-labels";
import { AuditRepository } from "./audit.repository";

const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const API_PREFIX = /^\/api(?=\/)/;

/**
 * Records every change made through the API (and backup downloads) in the activity log:
 * who, what and how it went. Request bodies are never logged.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger("Audit");

  public constructor(private readonly audit: AuditRepository) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<Request & { user?: User }>();
    const routePath = String((request.route as { path?: string } | undefined)?.path ?? request.path).replace(API_PREFIX, "");
    if (!WRITES.has(request.method) && !AUDITED_READS.has(routePath)) {
      return next.handle();
    }
    const write = (status: number) => {
      try {
        // Sign-in has no session yet: the username typed is logged (never the password).
        const body = request.body as { username?: unknown } | undefined;
        const typed = routePath === "/auth/login" && typeof body?.username === "string" ? body.username.slice(0, 64) : null;
        this.audit.record({
          memberId: request.user?.id ?? null,
          username: request.user?.username ?? typed,
          action: auditAction(request.method, routePath),
          request: `${request.method} ${request.originalUrl.replace(API_PREFIX, "").split("?")[0]!.slice(0, 200)}`,
          status,
          ip: request.ip ?? null
        });
      } catch (error) {
        this.logger.warn(`Writing the activity log failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    return next.handle().pipe(
      tap({
        next: () => write(context.switchToHttp().getResponse<Response>().statusCode),
        error: (error: unknown) => write(error instanceof HttpException ? error.getStatus() : 500)
      })
    );
  }
}
