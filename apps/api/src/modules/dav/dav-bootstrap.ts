import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DavGatewayService } from "./dav-gateway.service";
import { DavTasksClient } from "./dav-tasks.client";
import { MenuStore, NotesStore, OccasionsStore, RoutinesStore, ScheduleStore } from "./family-stores";
import { LegacyDataMigration } from "./legacy-migration";

const ATTEMPTS = 10;
const DELAY_MS = 2_000;

/**
 * Waits for Radicale to come up, then makes sure the family has at least one reminders list
 * and the menu, birthdays, shifts and notes collections, and moves the data still in the database.
 */
@Injectable()
export class DavBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger("CalDAV");

  public constructor(
    private readonly gateway: DavGatewayService,
    private readonly tasks: DavTasksClient,
    private readonly occasions: OccasionsStore,
    private readonly menu: MenuStore,
    private readonly schedule: ScheduleStore,
    private readonly notes: NotesStore,
    private readonly routines: RoutinesStore,
    private readonly migration: LegacyDataMigration
  ) {}

  public onApplicationBootstrap(): void {
    if (this.gateway.enabled) {
      void this.prepare(1);
    } else if (this.migration.pending() > 0) {
      this.logger.warn("CalDAV server disabled: menu, birthdays, shifts and notes stay in the database until it is enabled.");
    }
  }

  private async prepare(attempt: number): Promise<void> {
    try {
      await this.tasks.ensureDefaultList();
      for (const store of [this.occasions, this.menu, this.schedule, this.notes, this.routines]) {
        await store.ensure();
      }
      await this.migration.run();
      this.logger.log("Family collections ready.");
    } catch (error) {
      if (attempt >= ATTEMPTS) {
        this.logger.warn(`CalDAV server not ready: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      setTimeout(() => void this.prepare(attempt + 1), DELAY_MS).unref();
    }
  }
}
