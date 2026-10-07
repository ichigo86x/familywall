import type {
  Occasion,
  OccasionInput,
  HomeButtonsResponse,
  HomeEntity,
  WeatherLocation,
  WeatherResponse,
  ScheduleEntry,
  ScheduleEntryInput,
  AddCalendarInput,
  AddTaskListInput,
  FamilyNote,
  GoogleAuthCompleteInput,
  GoogleAuthStartInput,
  GoogleAuthStartResponse,
  NoteInput,
  RemoteTaskList,
  TaskListConfig,
  UpdateNoteInput,
  UpdateTaskInput,
  UpdateTaskListInput,
  AuthSession,
  CalendarConfig,
  CalendarResponse,
  CreateEventInput,
  CreateMemberInput,
  CreateProviderAccountInput,
  FamilyEvent,
  HouseholdSettings,
  ListsResponse,
  LoginInput,
  ProviderAccount,
  RecurrenceScope,
  RemoteCalendar,
  SetPasswordInput,
  SetupInput,
  UpdateCalendarInput,
  UpdateEventInput,
  UpdateMemberInput,
  UpdateSettingsInput,
  User
} from "@familywall/shared";

const TOKEN_KEY = "familywall.auth.token";

export class ApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: (): string | null => window.localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => window.localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => window.localStorage.removeItem(TOKEN_KEY)
};

let onUnauthorized: () => void = () => undefined;

/** Lets the auth provider drop the session when any request comes back 401. */
export const setUnauthorizedHandler = (handler: () => void): void => {
  onUnauthorized = handler;
};

// Resolved against the page, so it works at "/" and under the Home Assistant ingress prefix.
const apiUrl = (path: string): string => new URL(`api/${path}`, document.baseURI).toString();

const request = async <T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (response.status === 401 && token) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw new ApiError(payload?.error?.message ?? `Richiesta fallita (HTTP ${response.status})`, response.status, payload?.error?.code);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
};

const storeSession = (session: AuthSession): AuthSession => {
  tokenStore.set(session.token);
  return session;
};

export const api = {
  getSetupStatus: () => request<{ needsSetup: boolean }>("auth/setup"),
  setup: async (input: SetupInput) => storeSession(await request<AuthSession>("auth/setup", { method: "POST", json: input })),
  login: async (input: LoginInput) => storeSession(await request<AuthSession>("auth/login", { method: "POST", json: input })),
  me: async () => (await request<{ user: User }>("auth/me")).user,

  getSettings: () => request<HouseholdSettings>("settings"),
  updateSettings: (input: UpdateSettingsInput) => request<HouseholdSettings>("settings", { method: "PATCH", json: input }),

  getOccasions: async () => (await request<{ occasions: Occasion[] }>("occasions")).occasions,
  createOccasion: (input: OccasionInput) => request<{ occasion: Occasion }>("occasions", { method: "POST", json: input }),
  updateOccasion: (id: string, input: OccasionInput) => request<{ occasion: Occasion }>(`occasions/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
  deleteOccasion: (id: string) => request<void>(`occasions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getHomeButtons: () => request<HomeButtonsResponse>("home/buttons"),
  runHomeButton: (id: string) => request<void>(`home/buttons/${encodeURIComponent(id)}/run`, { method: "POST" }),
  getHomeEntities: async () => (await request<{ entities: HomeEntity[] }>("home/entities")).entities,

  getWeather: async () => (await request<WeatherResponse>("weather")).weather,
  searchWeatherPlaces: async (query: string) =>
    (await request<{ places: WeatherLocation[] }>(`weather/places?q=${encodeURIComponent(query)}`)).places,

  getMembers: async () => (await request<{ members: User[] }>("members")).members,
  createMember: async (input: CreateMemberInput) => (await request<{ member: User }>("members", { method: "POST", json: input })).member,
  updateMember: async (id: string, input: UpdateMemberInput) =>
    (await request<{ member: User }>(`members/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).member,
  setMemberPassword: (id: string, input: SetPasswordInput) =>
    request<void>(`members/${encodeURIComponent(id)}/password`, { method: "PUT", json: input }),
  deleteMember: (id: string) => request<void>(`members/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getProviderAccounts: async () => (await request<{ accounts: ProviderAccount[] }>("providers/accounts")).accounts,
  createProviderAccount: async (input: CreateProviderAccountInput) =>
    (await request<{ account: ProviderAccount }>("providers/accounts", { method: "POST", json: input })).account,
  deleteProviderAccount: (id: string) => request<void>(`providers/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getCalendarConfigs: async () => (await request<{ calendars: CalendarConfig[] }>("calendars/config")).calendars,
  discoverCalendars: async (accountId: string) =>
    (await request<{ calendars: RemoteCalendar[] }>(`calendars/discover/${encodeURIComponent(accountId)}`)).calendars,
  addCalendar: async (input: AddCalendarInput) => (await request<{ calendar: CalendarConfig }>("calendars", { method: "POST", json: input })).calendar,
  updateCalendar: async (id: string, input: UpdateCalendarInput) =>
    (await request<{ calendar: CalendarConfig }>(`calendars/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).calendar,
  deleteCalendar: (id: string) => request<void>(`calendars/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getCalendar: (from: string, to: string) =>
    request<CalendarResponse>(`calendars?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  createEvent: async (input: CreateEventInput) => (await request<{ event: FamilyEvent }>("events", { method: "POST", json: input })).event,
  updateEvent: (id: string, input: UpdateEventInput) => request<{ id: string }>(`events/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
  deleteEvent: (id: string, scope?: RecurrenceScope) =>
    request<void>(`events/${encodeURIComponent(id)}${scope ? `?scope=${scope}` : ""}`, { method: "DELETE" }),

  getLists: () => request<ListsResponse>("lists"),
  createTask: (listId: string, title: string) =>
    request<{ id: string }>(`lists/${encodeURIComponent(listId)}/tasks`, { method: "POST", json: { title } }),
  updateTask: (listId: string, taskId: string, input: UpdateTaskInput) =>
    request<void>(`lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, { method: "PATCH", json: input }),
  deleteTask: (listId: string, taskId: string) =>
    request<void>(`lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" }),

  getTaskListConfigs: async () => (await request<{ lists: TaskListConfig[] }>("lists/config")).lists,
  discoverTaskLists: async (accountId: string) =>
    (await request<{ lists: RemoteTaskList[] }>(`lists/discover/${encodeURIComponent(accountId)}`)).lists,
  addTaskList: async (input: AddTaskListInput) => (await request<{ list: TaskListConfig }>("lists/config", { method: "POST", json: input })).list,
  updateTaskList: async (id: string, input: UpdateTaskListInput) =>
    (await request<{ list: TaskListConfig }>(`lists/config/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).list,
  deleteTaskList: (id: string) => request<void>(`lists/config/${encodeURIComponent(id)}`, { method: "DELETE" }),

  startGoogleAuth: (input: GoogleAuthStartInput) => request<GoogleAuthStartResponse>("providers/google/start", { method: "POST", json: input }),
  completeGoogleAuth: async (input: GoogleAuthCompleteInput) =>
    (await request<{ account: ProviderAccount }>("providers/google/complete", { method: "POST", json: input })).account,

  getDavInfo: () => request<{ enabled: boolean; path: string; username: string }>("dav/info"),
  createDavProfileLink: (baseUrl: string) => request<{ token: string }>("dav/profile-link", { method: "POST", json: { baseUrl } }),

  setDashboardLists: (listIds: string[]) => request<{ listIds: string[] }>("lists/dashboard", { method: "PATCH", json: { listIds } }),

  getSchedule: async () => (await request<{ entries: ScheduleEntry[] }>("schedule")).entries,
  createScheduleEntry: async (input: ScheduleEntryInput) => (await request<{ entry: ScheduleEntry }>("schedule", { method: "POST", json: input })).entry,
  updateScheduleEntry: async (id: string, input: ScheduleEntryInput) =>
    (await request<{ entry: ScheduleEntry }>(`schedule/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).entry,
  deleteScheduleEntry: (id: string) => request<void>(`schedule/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getNotes: async () => (await request<{ notes: FamilyNote[] }>("notes")).notes,
  createNote: async (input: NoteInput) => (await request<{ note: FamilyNote }>("notes", { method: "POST", json: input })).note,
  updateNote: async (id: string, input: UpdateNoteInput) =>
    (await request<{ note: FamilyNote }>(`notes/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).note,
  deleteNote: (id: string) => request<void>(`notes/${encodeURIComponent(id)}`, { method: "DELETE" })
};
