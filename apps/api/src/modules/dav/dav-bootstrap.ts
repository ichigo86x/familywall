import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DavGatewayService } from "./dav-gateway.service";
import { DavTasksClient } from "./dav-tasks.client";

const ATTEMPTS = 10;
const DELAY_MS = 2_000;

/** Waits for Radicale to come up, then makes sure the family has at least one reminders list. */
@Injectable()
export class DavBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger("CalDAV");

  public constructor(
    private readonly gateway: DavGatewayService,
    private readonly tasks: DavTasksClient
  ) {}

  public onApplicationBootstrap(): void {
    if (this.gateway.enabled) {
      void this.prepare(1);
    }
  }

  private async prepare(attempt: number): Promise<void> {
    try {
      await this.tasks.ensureDefaultList();
      this.logger.log("Family reminders lists ready.");
    } catch (error) {
      if (attempt >= ATTEMPTS) {
        this.logger.warn(`CalDAV server not ready: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      setTimeout(() => void this.prepare(attempt + 1), DELAY_MS).unref();
    }
  }
}
