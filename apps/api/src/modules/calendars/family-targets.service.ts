import { Injectable, Logger } from "@nestjs/common";
import {
  FAMILY_TARGET_PROVIDERS,
  FAMILY_TARGET_PURPOSE,
  INTERNAL_TARGET,
  MEAL_SLOTS,
  type CalendarConfig,
  type FamilyDataKind,
  type FamilyTargetInfo,
  type FamilyTargetOption,
  type MenuMeal,
  type Occasion,
  type SetFamilyTargetResponse
} from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { FAMILY_COLLECTIONS, MenuStore, OccasionsStore } from "../dav/family-stores";
import { DavStore, type CollectionSpec } from "../dav/dav-store";
import { menuMapper, occasionMapper, type MenuMealFields, type OccasionFields } from "../dav/family-ics";
import { FamilyObjects } from "../dav/family-objects";
import { CalDavClient } from "../providers/caldav/caldav-client";
import { GoogleClient, parseGoogleSecret } from "../providers/google/google-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { CalendarsRepository } from "./calendars.repository";
import { GoogleCalendarStore, RemoteCalDavStore } from "./family-remote-stores";

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const SETTING_KEY = { menu: "menuCalendarId", occasions: "occasionsCalendarId" } as const;
const INTERNAL_NAME = { menu: "Menu (Familywall)", occasions: "Compleanni (Familywall)" } as const;

/** Where each kind of family data is: the built-in server (null) or a provider calendar. */
type Target = CalendarConfig | null;

/**
 * Menu and birthdays are kept on the built-in CalDAV server unless the family has a calendar for them
 * on iCloud, Google or another CalDAV server: a calendar marked "Menu" or "Compleanni" is used
 * automatically, or the Admin chooses one. Data can be moved from one place to the other.
 */
@Injectable()
export class FamilyTargetsService {
  private readonly logger = new Logger("FamilyData");
  /** One store per provider calendar, so its cache is shared by the requests. */
  private readonly stores = new Map<string, { key: string; store: DavStore }>();

  public constructor(
    private readonly calendars: CalendarsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly caldav: CalDavClient,
    private readonly google: GoogleClient,
    private readonly settings: SettingsRepository,
    private readonly menuStore: MenuStore,
    private readonly occasionsStore: OccasionsStore
  ) {}

  /**
   * Calendars that can hold this data: visible, of iCloud, Google or a CalDAV server. Google's generated
   * calendars (birthdays from the contacts, holidays) are read-only and left out.
   */
  private candidates(): CalendarConfig[] {
    return this.calendars
      .list({ enabledOnly: true })
      .filter((config) => FAMILY_TARGET_PROVIDERS.includes(config.provider) && !/#(contacts|holiday)@group\.v\.calendar\.google\.com/i.test(safeDecode(config.remoteUrl)));
  }

  private resolve(kind: FamilyDataKind, setting = this.settings.get()[SETTING_KEY[kind]]): Target {
    if (setting === INTERNAL_TARGET) {
      return null;
    }
    const candidates = this.candidates();
    if (setting) {
      // A chosen calendar that was removed or hidden: back to the automatic choice.
      const chosen = candidates.find((config) => config.id === setting);
      if (chosen) {
        return chosen;
      }
    }
    return candidates.find((config) => config.purpose === FAMILY_TARGET_PURPOSE[kind]) ?? null;
  }

  /** The provider calendar used for this data, or null for the built-in server. */
  public target(kind: FamilyDataKind): Target {
    return this.resolve(kind);
  }

  private option(target: Target, kind: FamilyDataKind): FamilyTargetOption {
    return target
      ? { id: target.id, name: target.name, provider: target.provider, accountLabel: target.accountLabel }
      : { id: INTERNAL_TARGET, name: INTERNAL_NAME[kind], provider: "internal", accountLabel: null };
  }

  public async info(kind: FamilyDataKind): Promise<FamilyTargetInfo> {
    const target = this.resolve(kind);
    return {
      kind,
      setting: this.settings.get()[SETTING_KEY[kind]],
      current: this.option(target, kind),
      options: [this.option(null, kind), ...this.candidates().map((config) => this.option(config, kind))],
      leftover: target ? (await this.internalItems(kind)).length : 0
    };
  }

  /** What is on the built-in server, read apart while a provider calendar is used (empty when unreachable). */
  public async internalItems(kind: FamilyDataKind): Promise<Array<{ id: string }>> {
    try {
      return kind === "menu" ? await this.menuStore.list() : await this.occasionsStore.list();
    } catch {
      return [];
    }
  }

  private store(target: CalendarConfig): DavStore {
    const credentials = this.accounts.credentials(target.accountId);
    if (!credentials) {
      throw AppException.providerError(`Account del calendario "${target.name}" non trovato.`);
    }
    // A changed password or URL gives a new store.
    const key = `${target.remoteUrl}|${credentials.username}|${credentials.password}`;
    const cached = this.stores.get(target.id);
    if (cached?.key === key) {
      return cached.store;
    }
    const store =
      target.provider === "google"
        ? new GoogleCalendarStore(this.google, parseGoogleSecret(credentials.password), target.remoteUrl)
        : new RemoteCalDavStore(this.caldav, credentials, target.remoteUrl);
    this.stores.set(target.id, { key, store });
    return store;
  }

  private spec(target: CalendarConfig, kind: FamilyDataKind): CollectionSpec {
    const internal = kind === "menu" ? FAMILY_COLLECTIONS.menu : FAMILY_COLLECTIONS.occasions;
    return { ...internal, name: target.id, displayName: target.name };
  }

  private readContext() {
    return () => ({ timezone: this.settings.get().timezone, now: new Date() });
  }

  public menuObjects(target: Target = this.resolve("menu")): FamilyObjects<MenuMeal, MenuMealFields> {
    return target ? new FamilyObjects(this.store(target), this.spec(target, "menu"), menuMapper, this.readContext(), "Piatto non trovato.") : this.menuStore;
  }

  public occasionObjects(target: Target = this.resolve("occasions")): FamilyObjects<Occasion, OccasionFields> {
    return target
      ? new FamilyObjects(this.store(target), this.spec(target, "occasions"), occasionMapper, this.readContext(), "Ricorrenza non trovata.")
      : this.occasionsStore;
  }

  /** Dishes between two local dates (both included), in the order of the day. */
  public async mealsBetween(from: string, to: string): Promise<MenuMeal[]> {
    return (await this.menuObjects().list())
      .filter((meal) => meal.date >= from && meal.date <= to)
      .sort((left, right) => left.date.localeCompare(right.date) || MEAL_SLOTS.indexOf(left.slot) - MEAL_SLOTS.indexOf(right.slot) || left.title.localeCompare(right.title));
  }

  public async occasions(): Promise<Occasion[]> {
    return (await this.occasionObjects().list()).sort((left, right) => left.month - right.month || left.day - right.day || left.name.localeCompare(right.name));
  }

  /**
   * Chooses where the data is kept. With move=true everything on the current calendar is copied to
   * the new one (same ids) and then deleted from the old one; an item that fails stays where it was.
   */
  public async setTarget(kind: FamilyDataKind, setting: string | null, move: boolean): Promise<SetFamilyTargetResponse> {
    if (setting !== null && setting !== INTERNAL_TARGET && !this.candidates().some((config) => config.id === setting)) {
      throw AppException.validation("Calendario non valido: scegli un calendario visibile di iCloud, Google o di un server CalDAV.");
    }
    const from = this.resolve(kind);
    const to = this.resolve(kind, setting);
    let moved = 0;
    let failed = 0;

    if (move) {
      // The current calendar and what is left on the built-in server both go to the new place.
      const sources = [from, null].filter((source, index, all) => all.findIndex((other) => other?.id === source?.id) === index && source?.id !== to?.id);
      for (const source of sources) {
        const result =
          kind === "menu" ? await this.moveAll(this.menuObjects(source), this.menuObjects(to)) : await this.moveAll(this.occasionObjects(source), this.occasionObjects(to));
        moved += result.moved;
        failed += result.failed;
      }
      this.logger.log(`Moved ${moved} ${kind} items to ${to?.name ?? "the built-in server"} (${failed} failed).`);
    }

    this.settings.setFamilyTarget(SETTING_KEY[kind], setting);
    // The chosen calendar is shown as menu or birthdays in the calendar too.
    if (to && to.purpose !== FAMILY_TARGET_PURPOSE[kind]) {
      this.calendars.update(to.id, { purpose: FAMILY_TARGET_PURPOSE[kind] });
    }
    return { target: await this.info(kind), moved, failed };
  }

  private async moveAll<T extends { id: string }, F>(source: FamilyObjects<T, F>, destination: FamilyObjects<T, F>): Promise<{ moved: number; failed: number }> {
    const items = await source.list();
    let moved = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const { id, ...fields } = item;
        await destination.create(fields as unknown as F, { id });
        await source.delete(id);
        moved += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(`Moving ${item.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { moved, failed };
  }
}
