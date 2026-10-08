import { describe, expect, it, vi } from "vitest";
import { createTestContext } from "../../test/test-context";
import type { DavGatewayService } from "../dav/dav-gateway.service";
import type { DavTasksClient } from "../dav/dav-tasks.client";
import { HomeAssistantClient } from "../home/home-assistant.client";
import type { GoogleClient } from "../providers/google/google-client";
import { IcloudBridgeError, type IcloudBridge, type IcloudReminder } from "../providers/icloud-web/icloud-bridge";
import { ListsService } from "./lists.service";
import { TaskListsRepository } from "./task-lists.repository";

const reminder = (patch: Partial<IcloudReminder>): IcloudReminder => ({
  id: "r",
  title: "Latte",
  desc: "",
  completed: false,
  completed_date: null,
  due_date: null,
  parent: null,
  ...patch
});

describe("iCloud Reminders lists (pyicloud)", () => {
  const setup = () => {
    const ctx = createTestContext();
    const account = ctx.accounts.insert({ provider: "icloudweb", label: "Promemoria", username: "famiglia@example.com", password: "segreta", serverUrl: null });
    const lists = new TaskListsRepository(ctx.db);
    const config = lists.insert({ accountId: account.id, remoteId: "L1", name: "Spesa iCloud", color: "#0EA5E9" });
    const bridge = {
      reminders: vi.fn(async () => [
        reminder({ id: "a", title: "Latte" }),
        reminder({ id: "b", title: "Pane", completed: true, completed_date: new Date().toISOString() }),
        reminder({ id: "c", title: "Vecchio", completed: true, completed_date: "2020-01-01T00:00:00Z" }),
        reminder({ id: "d", title: "Sotto-voce", parent: "a" })
      ]),
      create: vi.fn(async () => reminder({ id: "new" })),
      update: vi.fn(async () => reminder({})),
      delete: vi.fn(async () => ({}))
    };
    const service = new ListsService(
      lists,
      ctx.accounts,
      {} as GoogleClient,
      {} as DavTasksClient,
      { enabled: false } as DavGatewayService,
      new HomeAssistantClient(null),
      ctx.settings,
      bridge as unknown as IcloudBridge
    );
    return { ctx, account, config, bridge, service };
  };

  it("shows open reminders and the recently completed ones, and writes through the bridge", async () => {
    const { config, bridge, service } = setup();
    const { lists } = await service.getLists();
    expect(lists).toMatchObject([{ id: config.id, source: "icloud", lastError: null }]);
    expect(lists[0]!.tasks.map((task) => [task.title, task.completed])).toEqual([["Latte", false], ["Pane", true]]);

    expect(await service.createTask(config.id, { title: "Uova" })).toEqual({ id: "new" });
    await service.updateTask(config.id, "a", { completed: true });
    await service.deleteTask(config.id, "a");
    expect(bridge.create.mock.calls[0]!.slice(2)).toEqual(["L1", "Uova"]);
    expect(bridge.update.mock.calls[0]!.slice(2)).toEqual(["a", { completed: true }]);
    // "Vecchio" was completed years ago: outside the six months of suggestions.
    expect(await service.suggestions(config.id)).toEqual(["Pane"]);
  });

  it("marks the account when iCloud asks the code again", async () => {
    const { ctx, account, bridge, service } = setup();
    bridge.reminders.mockRejectedValueOnce(new IcloudBridgeError("2fa_required", "iCloud chiede il codice di verifica."));
    const { lists } = await service.getLists();
    expect(lists[0]!.lastError).toMatch(/codice/);
    expect(ctx.accounts.findById(account.id)!.status).toBe("verify");
  });
});
