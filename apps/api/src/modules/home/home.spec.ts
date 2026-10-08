import { describe, expect, it, vi } from "vitest";
import { homeButtonSchema, type User } from "@familywall/shared";
import { openDatabase } from "../../database/database";
import { SettingsRepository } from "../settings/settings.repository";
import { HomeAssistantClient } from "./home-assistant.client";
import { HomeService } from "./home.service";

const user = (role: User["role"]): User => ({ id: role, username: role.toLowerCase(), displayName: role, role, color: "#000000", disabled: false, keywords: [], canLogin: true, panelWrite: false, totpEnabled: false });

const door = { id: "door", label: "Portone", icon: "🚪", entityId: "lock.portone", service: "open", confirm: true, roles: ["Parent" as const, "Kiosk" as const] };

describe("homeButtonSchema", () => {
  it("only accepts the services allowed for the entity domain", () => {
    expect(homeButtonSchema.safeParse(door).success).toBe(true);
    expect(homeButtonSchema.safeParse({ ...door, service: "turn_off" }).success).toBe(false);
    expect(homeButtonSchema.safeParse({ ...door, entityId: "shell_command.reboot", service: "run" }).success).toBe(false);
  });
});

describe("HomeService", () => {
  const setup = () => {
    const settings = new SettingsRepository(openDatabase(":memory:"));
    settings.update({ homeButtons: [door] });
    const fetchImpl = vi.fn(async (url: string, _init: RequestInit) =>
      url.endsWith("/states")
        ? new Response(JSON.stringify([{ entity_id: "lock.portone", state: "locked", attributes: { friendly_name: "Portone" } }]))
        : new Response("[]")
    );
    const service = new HomeService(settings, new HomeAssistantClient({ url: "http://supervisor/core/api", token: "t" }, fetchImpl));
    return { service, fetchImpl };
  };

  it("shows buttons by role with their state and calls the service", async () => {
    const { service, fetchImpl } = setup();

    expect((await service.buttons(user("Kiosk"))).buttons).toMatchObject([{ id: "door", state: "locked" }]);
    expect((await service.buttons(user("Child"))).buttons).toEqual([]);

    await service.run(user("Kiosk"), "door");
    const [url, init] = fetchImpl.mock.calls.at(-1)!;
    expect(url).toBe("http://supervisor/core/api/services/lock/open");
    expect(JSON.parse(String(init.body))).toEqual({ entity_id: "lock.portone" });

    await expect(service.run(user("Child"), "door")).rejects.toThrow(/non trovato/);
    expect(await service.entities()).toEqual([{ entityId: "lock.portone", name: "Portone", state: "locked" }]);
  });

  it("works without Home Assistant", async () => {
    const settings = new SettingsRepository(openDatabase(":memory:"));
    const service = new HomeService(settings, new HomeAssistantClient(null));
    expect(await service.buttons(user("Admin"))).toEqual({ available: false, buttons: [] });
    expect(await service.entities()).toEqual([]);
  });
});
