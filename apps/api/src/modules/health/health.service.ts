import { Inject, Injectable } from "@nestjs/common";
import type { HealthResponse } from "@familywall/shared";
import { DATABASE, type Database } from "../../database/database";

@Injectable()
export class HealthService {
  public constructor(@Inject(DATABASE) private readonly db: Database) {}

  public getHealth(): HealthResponse {
    try {
      this.db.prepare("SELECT 1").get();
      return { status: "ok", services: { database: { state: "ok", detail: "SQLite available" } } };
    } catch (error) {
      return {
        status: "degraded",
        services: { database: { state: "error", detail: error instanceof Error ? error.message : "SQLite unavailable" } }
      };
    }
  }
}
