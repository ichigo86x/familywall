import { Injectable, Logger } from "@nestjs/common";
import { HOME_SERVICES, homeDomain, isAllowedHomeService, panelView, type HomeButton, type HomeButtonsResponse, type HomeEntity, type HomePresence, type HomePresenceResponse, type User } from "@familywall/shared";
import { AppException } from "../../common/errors/app-exception";
import { SettingsRepository } from "../settings/settings.repository";
import { HomeAssistantClient, HomeAssistantError } from "./home-assistant.client";

const canUse = (button: HomeButton, viewer: User): boolean => viewer.role === "Admin" || button.roles.includes(viewer.role);

@Injectable()
export class HomeService {
  private readonly logger = new Logger(HomeService.name);

  public constructor(
    private readonly settings: SettingsRepository,
    private readonly client: HomeAssistantClient
  ) {}

  /** The viewer's buttons with the current state of their entities (state is null when HA cannot be read). */
  public async buttons(viewer: User): Promise<HomeButtonsResponse> {
    const settings = this.settings.get();
    // A panel may show only some of the buttons (e.g. the gate in the hall, the lights in the kitchen).
    const onlyIds = viewer.role === "Kiosk" ? panelView(settings, viewer.id).homeButtonIds : null;
    const buttons = settings.homeButtons.filter((button) => canUse(button, viewer) && (onlyIds === null || onlyIds.includes(button.id)));
    if (!this.client.available) {
      return { available: false, buttons: [] };
    }
    if (buttons.length === 0) {
      return { available: true, buttons: [] };
    }
    let states = new Map<string, string>();
    try {
      states = new Map((await this.client.states()).map((entity) => [entity.entity_id, entity.state]));
    } catch (error) {
      this.logger.warn(`Reading Home Assistant states failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { available: true, buttons: buttons.map((button) => ({ ...button, state: states.get(button.entityId) ?? null })) };
  }

  public async run(viewer: User, buttonId: string): Promise<void> {
    const button = this.settings.get().homeButtons.find((entry) => entry.id === buttonId);
    if (!button || !canUse(button, viewer)) {
      throw AppException.notFound("Pulsante non trovato.");
    }
    // Settings are validated on save; checked again in case they were edited by hand.
    if (!isAllowedHomeService(button.entityId, button.service)) {
      throw AppException.forbidden("Azione non consentita per questa entità.");
    }
    try {
      await this.client.callService(homeDomain(button.entityId), button.service, button.entityId);
    } catch (error) {
      throw AppException.providerError(error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.");
    }
    this.logger.log(`${viewer.username} ran "${button.label}" (${button.service} ${button.entityId})`);
  }

  /** Calendars of Home Assistant (calendar.* entities: iCloud, Google, local, school holidays...). */
  public async calendarEntities(): Promise<HomeEntity[]> {
    return this.entitiesOf("calendar");
  }

  private async entitiesOf(domain: string): Promise<HomeEntity[]> {
    if (!this.client.available) {
      return [];
    }
    try {
      return (await this.client.states())
        .filter((entity) => homeDomain(entity.entity_id) === domain)
        .map((entity) => ({ entityId: entity.entity_id, name: entity.attributes?.friendly_name ?? entity.entity_id, state: entity.state }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw AppException.providerError(error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.");
    }
  }

  /** People of Home Assistant (person.*), to link to the members. */
  public async personEntities(): Promise<HomeEntity[]> {
    return this.entitiesOf("person");
  }

  /** Where the linked members are: at home, away, or in a named zone. Empty without Home Assistant. */
  public async presence(): Promise<HomePresenceResponse> {
    const links = this.settings.get().homePresence ?? [];
    if (!this.client.available || links.length === 0) {
      return { people: [] };
    }
    try {
      const states = new Map((await this.client.states()).map((entity) => [entity.entity_id, entity]));
      return {
        people: links.map((link): HomePresence => {
          const entity = states.get(link.entityId);
          const state = entity?.state ?? "unknown";
          return {
            memberId: link.memberId,
            state: state === "home" ? "home" : state === "not_home" ? "away" : state === "unknown" || state === "unavailable" ? "unknown" : "zone",
            zone: state === "home" || state === "not_home" || state === "unknown" || state === "unavailable" ? null : state,
            since: entity?.last_changed ?? null
          };
        })
      };
    } catch (error) {
      throw AppException.providerError(error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.");
    }
  }

  /** To-do lists of Home Assistant (Apple Reminders through the iCloud integration, Bring!, Todoist, local lists...). */
  public async todoEntities(): Promise<HomeEntity[]> {
    return this.entitiesOf("todo");
  }

  /** Home Assistant is reachable only inside the add-on (Supervisor) or with HA_URL and a long-lived HA_TOKEN. */
  public get available(): boolean {
    return this.client.available;
  }

  /** Entities an Admin can turn into buttons (only domains with allowed services). */
  public async entities(): Promise<HomeEntity[]> {
    if (!this.client.available) {
      return [];
    }
    try {
      return (await this.client.states())
        .filter((entity) => homeDomain(entity.entity_id) in HOME_SERVICES)
        .map((entity) => ({ entityId: entity.entity_id, name: entity.attributes?.friendly_name ?? entity.entity_id, state: entity.state }))
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw AppException.providerError(error instanceof HomeAssistantError ? error.message : "Home Assistant non disponibile.");
    }
  }
}
