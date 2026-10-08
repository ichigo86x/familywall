type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class HomeAssistantError extends Error {}

export interface HaState {
  entity_id: string;
  state: string;
  attributes?: { friendly_name?: string };
}

/** An item of a Home Assistant to-do list (todo.get_items). */
export interface HaTodoItem {
  uid: string;
  summary: string;
  status: "needs_action" | "completed";
  due?: string | null;
  description?: string | null;
}

/** Minimal Home Assistant REST client: read states, call services. */
export class HomeAssistantClient {
  public constructor(
    private readonly connection: { url: string; token: string } | null,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly timeoutMs = 8_000
  ) {}

  public get available(): boolean {
    return this.connection !== null;
  }

  public async states(): Promise<HaState[]> {
    return (await this.request("GET", "/states")) as HaState[];
  }

  public async callService(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.request("POST", `/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, { ...data, entity_id: entityId });
  }

  /** Items of a to-do entity (open ones first, as Home Assistant returns them). */
  public async todoItems(entityId: string): Promise<HaTodoItem[]> {
    const response = (await this.request("POST", "/services/todo/get_items?return_response", { entity_id: entityId, status: ["needs_action", "completed"] })) as {
      service_response?: Record<string, { items?: HaTodoItem[] }>;
    };
    return response.service_response?.[entityId]?.items ?? [];
  }

  private async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    if (!this.connection) {
      throw new HomeAssistantError("Home Assistant non è collegato.");
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.connection.url + path, {
        method,
        headers: { Authorization: `Bearer ${this.connection.token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new HomeAssistantError(`Home Assistant non raggiungibile: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new HomeAssistantError("Home Assistant ha rifiutato l'accesso: controlla il token.");
    }
    if (!response.ok) {
      throw new HomeAssistantError(`Home Assistant ha risposto HTTP ${response.status}.`);
    }
    return response.json();
  }
}
