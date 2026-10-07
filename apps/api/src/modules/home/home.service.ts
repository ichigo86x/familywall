import { Injectable, Logger } from "@nestjs/common";
import { HOME_SERVICES, homeDomain, isAllowedHomeService, type HomeButton, type HomeButtonsResponse, type HomeEntity, type User } from "@familywall/shared";
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
    const buttons = this.settings.get().homeButtons.filter((button) => canUse(button, viewer));
    if (!this.client.available || buttons.length === 0) {
      return { available: this.client.available, buttons: buttons.map((button) => ({ ...button, state: null })) };
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
