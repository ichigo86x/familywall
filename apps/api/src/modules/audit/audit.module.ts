import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditController } from "./audit.controller";
import { AuditInterceptor } from "./audit.interceptor";
import { AuditRepository } from "./audit.repository";

@Module({
  controllers: [AuditController],
  providers: [AuditRepository, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditRepository]
})
export class AuditModule {}
