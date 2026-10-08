import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../database/database";
import { DavGatewayService } from "../dav/dav-gateway.service";
import { DavTasksClient } from "../dav/dav-tasks.client";
import { HomeAssistantClient } from "../home/home-assistant.client";
import type { IcloudBridge } from "../providers/icloud-web/icloud-bridge";
import { GoogleClient } from "../providers/google/google-client";
import { ProviderAccountsRepository } from "../providers/provider-accounts.repository";
import { SettingsRepository } from "../settings/settings.repository";
import { ListsService } from "./lists.service";
import { TaskListsRepository } from "./task-lists.repository";

describe("Home Assistant to-do lists", () => {
  const setup = () => {
    const db = openDatabase(":memory:");
    const settings = new SettingsRepository(db);
    settings.update({ homeLists: [{ entityId: "todo.spesa_icloud", name: "Spesa iCloud", color: "#0EA5E9" }] });
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return url.includes("get_items")
        ? new Response(
            JSON.stringify({
              changed_states: [],
              service_response: {
                "todo.spesa_icloud": {
                  items: [
                    { uid: "a1", summary: "Latte", status: "needs_action" },
                    { uid: "b2", summary: "Pane", status: "completed" }
                  ]
                }
              }
            })
          )
        : new Response("[]");
    });
    const davGateway = { enabled: false } as DavGatewayService;
    const service = new ListsService(
      new TaskListsRepository(db),
      {} as ProviderAccountsRepository,
      {} as GoogleClient,
      {} as DavTasksClient,
      davGateway,
      new HomeAssistantClient({ url: "http://supervisor/core/api", token: "t" }, fetchImpl),
      settings,
      {} as IcloudBridge
    );
    return { service, calls };
  };

  it("reads open items and writes through the todo services", async () => {
    const { service, calls } = setup();
    const { lists } = await service.getLists();
    expect(lists).toMatchObject([{ id: "ha:todo.spesa_icloud", name: "Spesa iCloud", source: "homeassistant", lastError: null, tasks: [{ id: "a1", title: "Latte", completed: false }] }]);
    expect(calls[0]).toEqual({ url: "http://supervisor/core/api/services/todo/get_items?return_response", body: { entity_id: "todo.spesa_icloud", status: ["needs_action", "completed"] } });

    await service.createTask("ha:todo.spesa_icloud", { title: "Uova" });
    await service.updateTask("ha:todo.spesa_icloud", "b2", { completed: true });
    await service.deleteTask("ha:todo.spesa_icloud", "a1");
    expect(calls.slice(1)).toEqual([
      { url: "http://supervisor/core/api/services/todo/add_item", body: { item: "Uova", entity_id: "todo.spesa_icloud" } },
      { url: "http://supervisor/core/api/services/todo/update_item", body: { item: "b2", status: "completed", entity_id: "todo.spesa_icloud" } },
      { url: "http://supervisor/core/api/services/todo/remove_item", body: { item: ["a1"], entity_id: "todo.spesa_icloud" } }
    ]);
    // Ticked here: stays visible (struck through) although Home Assistant does not say when.
    expect((await service.getLists()).lists[0]!.tasks.map((task) => [task.title, task.completed])).toEqual([["Latte", false], ["Pane", true]]);
    await expect(service.createTask("ha:todo.altro", { title: "X" })).rejects.toThrow(/non trovata/);
    expect(await service.suggestions("ha:todo.spesa_icloud")).toEqual(["Pane"]);
  });
});
