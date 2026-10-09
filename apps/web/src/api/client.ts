import type {
  FamilyDataKind,
  FamilyTargetsResponse,
  SetFamilyTargetResponse,
  MenuIngredientsResponse,
  MenuMeal,
  MenuMealInput,
  Occasion,
  OccasionInput,
  HomeButtonsResponse,
  HomeEntity,
  WeatherLocation,
  WeatherResponse,
  ScheduleEntry,
  ScheduleEntryInput,
  Routine,
  TotpEnabledResponse,
  TotpSetupResponse,
  AuditLogResponse,
  RoutineInput,
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

import { clearResourceMemory } from "@/hooks/use-async-resource";
import { connection, offlineCache } from "./offline-cache";

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
  set: (token: string): void => {
    // Another member may sign in on this device: nothing of the previous session is shown.
    clearResourceMemory();
    window.localStorage.setItem(TOKEN_KEY, token);
  },
  clear: (): void => {
    window.localStorage.removeItem(TOKEN_KEY);
    offlineCache.clear();
    clearResourceMemory();
  }
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

  const isRead = (init.method ?? "GET") === "GET";
  // Offline or server down: reads fall back to the last answer saved on this device.
  const fromCache = (failure: Error): T => {
    const cached = isRead ? offlineCache.load(path) : null;
    if (!cached) {
      throw failure;
    }
    connection.markOffline(cached.savedAt);
    return cached.body as T;
  };

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      cache: "no-store"
    });
  } catch {
    return fromCache(new ApiError(isRead ? "Connessione assente." : "Sei offline: riprova quando torna la connessione.", 0, "OFFLINE"));
  }

  if (isRead && (response.status === 502 || response.status === 503 || response.status === 504)) {
    return fromCache(new ApiError(`Server non raggiungibile (HTTP ${response.status}).`, response.status, "OFFLINE"));
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
    if (response.status === 401 && token) {
      tokenStore.clear();
      onUnauthorized();
    }
    throw new ApiError(payload?.error?.message ?? `Richiesta fallita (HTTP ${response.status})`, response.status, payload?.error?.code);
  }

  connection.markOnline();
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json()) as T;
  if (isRead) {
    offlineCache.save(path, body);
  }
  return body;
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

  getMenu: async (from: string, to: string) =>
    (await request<{ meals: MenuMeal[] }>(`menu?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)).meals,
  createMenuMeal: (input: MenuMealInput) => request<{ meal: MenuMeal }>("menu", { method: "POST", json: input }),
  updateMenuMeal: (id: string, input: MenuMealInput) => request<{ meal: MenuMeal }>(`menu/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
  deleteMenuMeal: (id: string) => request<void>(`menu/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getCookidooIngredients: async (eventIds: string[]) =>
    (await request<MenuIngredientsResponse>(`menu/ingredients?ids=${encodeURIComponent(eventIds.join(","))}`)).ingredients,

  getOccasions: async () => (await request<{ occasions: Occasion[] }>("occasions")).occasions,
  getFamilyTargets: () => request<FamilyTargetsResponse>("family-targets"),
  setFamilyTarget: (kind: FamilyDataKind, target: string | null, move: boolean) =>
    request<SetFamilyTargetResponse>(`family-targets/${kind}`, { method: "PUT", json: { target, move } }),
  createOccasion: (input: OccasionInput) => request<{ occasion: Occasion }>("occasions", { method: "POST", json: input }),
  updateOccasion: (id: string, input: OccasionInput) => request<{ occasion: Occasion }>(`occasions/${encodeURIComponent(id)}`, { method: "PATCH", json: input }),
  deleteOccasion: (id: string) => request<void>(`occasions/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getStoredBackups: async () => (await request<{ backups: Array<{ name: string; size: number; createdAt: string }> }>("backup/stored")).backups,
  /** Downloads a backup file (the Authorization header rules out a plain link). */
  downloadBackup: async (path: string): Promise<void> => {
    const response = await fetch(apiUrl(path), { headers: { Authorization: `Bearer ${tokenStore.get() ?? ""}` }, cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new ApiError(payload?.error?.message ?? `Download non riuscito (HTTP ${response.status})`, response.status);
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "familywall.fwbackup";
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await response.blob());
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  },
  restoreBackup: (file: File) =>
    request<{ members: number; lists: number; credentials: "kept" | "re-encrypted" | "unreadable" }>("backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file
    }),

  getHomeButtons: () => request<HomeButtonsResponse>("home/buttons"),
  runHomeButton: (id: string) => request<void>(`home/buttons/${encodeURIComponent(id)}/run`, { method: "POST" }),
  getHomeStatus: () => request<{ available: boolean }>("home/status"),
  getHomeCalendarEntities: async () => (await request<{ entities: HomeEntity[] }>("home/calendar-entities")).entities,
  getHomeTodoEntities: async () => (await request<{ entities: HomeEntity[] }>("home/todo-entities")).entities,
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
  verifyIcloud: async (accountId: string, code: string) =>
    (await request<{ account: ProviderAccount }>(`providers/accounts/${encodeURIComponent(accountId)}/icloud/verify`, { method: "POST", json: { code } })).account,
  reconnectIcloud: async (accountId: string) =>
    (await request<{ account: ProviderAccount }>(`providers/accounts/${encodeURIComponent(accountId)}/icloud/reconnect`, { method: "POST", json: {} })).account,
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
  setupTotp: () => request<TotpSetupResponse>("auth/totp/setup", { method: "POST", json: {} }),
  enableTotp: (code: string) => request<TotpEnabledResponse>("auth/totp/enable", { method: "POST", json: { code } }),
  disableTotp: (password: string, code: string) => request<void>("auth/totp/disable", { method: "POST", json: { password, code } }),
  resetTotp: (memberId: string) => request<void>(`auth/totp/reset/${encodeURIComponent(memberId)}`, { method: "POST", json: {} }),
  getAuditLog: (before: number | null) => request<AuditLogResponse>(`audit${before === null ? "" : `?before=${before}`}`),
  getListSuggestions: async (listId: string) => (await request<{ suggestions: string[] }>(`lists/${encodeURIComponent(listId)}/suggestions`)).suggestions,
  setChoreDone: async (id: string, date: string, done: boolean) =>
    (await request<{ entry: ScheduleEntry }>(`schedule/${encodeURIComponent(id)}/done`, { method: "POST", json: { date, done } })).entry,
  getRoutines: async () => (await request<{ routines: Routine[] }>("routines")).routines,
  createRoutine: async (input: RoutineInput) => (await request<{ routine: Routine }>("routines", { method: "POST", json: input })).routine,
  updateRoutine: async (id: string, input: RoutineInput) =>
    (await request<{ routine: Routine }>(`routines/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).routine,
  deleteRoutine: (id: string) => request<void>(`routines/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setRoutineStep: async (id: string, date: string, step: number, done: boolean) =>
    (await request<{ routine: Routine }>(`routines/${encodeURIComponent(id)}/steps`, { method: "POST", json: { date, step, done } })).routine,
  deleteScheduleEntry: (id: string) => request<void>(`schedule/${encodeURIComponent(id)}`, { method: "DELETE" }),

  getNotes: async () => (await request<{ notes: FamilyNote[] }>("notes")).notes,
  createNote: async (input: NoteInput) => (await request<{ note: FamilyNote }>("notes", { method: "POST", json: input })).note,
  updateNote: async (id: string, input: UpdateNoteInput) =>
    (await request<{ note: FamilyNote }>(`notes/${encodeURIComponent(id)}`, { method: "PATCH", json: input })).note,
  deleteNote: (id: string) => request<void>(`notes/${encodeURIComponent(id)}`, { method: "DELETE" })
};
