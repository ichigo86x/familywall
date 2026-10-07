import type { WeatherLocation } from "./weather";

export type UserRole = "Admin" | "Parent" | "Child" | "Kiosk";

export const USER_ROLES: readonly UserRole[] = ["Admin", "Parent", "Child", "Kiosk"];

export type Permission =
  | "calendar:read"
  | "events:write"
  | "members:manage"
  | "providers:manage"
  | "settings:manage"
  /** Add, tick and remove list items and family notes. */
  | "lists:write";

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  Admin: ["calendar:read", "events:write", "members:manage", "providers:manage", "settings:manage", "lists:write"],
  Parent: ["calendar:read", "events:write", "lists:write"],
  Child: ["calendar:read", "lists:write"],
  Kiosk: ["calendar:read"]
};

/** Extra rights of a wall panel in write mode: add events, shifts, list items and notes from the wall. */
export const PANEL_WRITE_PERMISSIONS: readonly Permission[] = ["events:write", "lists:write"];

export const hasPermission = (role: UserRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

/** Permissions of a specific member: the role's ones, plus write mode for panels that have it. */
export const userCan = (user: Pick<User, "role" | "panelWrite">, permission: Permission): boolean =>
  hasPermission(user.role, permission) || (user.role === "Kiosk" && user.panelWrite && PANEL_WRITE_PERMISSIONS.includes(permission));

export type ErrorDetails = Record<string, unknown> | null;

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  color: string;
  disabled: boolean;
  /** Extra words that identify the member in event titles (the display name always counts). */
  keywords: string[];
  /** False for tag-only members: they appear on events but have no password and cannot sign in. */
  canLogin: boolean;
  /** Kiosk only: the panel may also write events, shifts, lists and notes. */
  panelWrite: boolean;
}

export interface AuthSession {
  user: User;
  token: string;
}

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface CurrentUserResponse {
  user: User;
}

export interface MembersResponse {
  members: User[];
}

export interface MemberResponse {
  member: User;
}

export interface HouseholdSettings {
  householdName: string;
  locale: string;
  timezone: string;
  wallModeEnabled: boolean;
  /** Lists shown on the dashboard (ids from GET /lists); empty = the shopping list. */
  dashboardListIds: string[];
  /** Place for the dashboard weather; null = no weather. */
  weatherLocation: WeatherLocation | null;
  /** Night mode of wall panels: dark screen with a dim clock between start and end (HH:MM, may cross midnight). */
  panelNight: PanelNight;
}

export interface PanelNight {
  enabled: boolean;
  start: string;
  end: string;
}

const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** True when the clock time falls in the night window (which may cross midnight). */
export const isNightTime = (night: PanelNight, now: Date): boolean => {
  if (!night.enabled) {
    return false;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOf(night.start);
  const end = minutesOf(night.end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
};

export type CalendarProvider = "icloud" | "caldav" | "cookidoo" | "google";

/** Providers Familywall can only read from (no event writes). */
export const READ_ONLY_PROVIDERS: readonly CalendarProvider[] = ["cookidoo"];

export type ConnectionStatus = "ok" | "error" | "unknown";

export interface ProviderAccount {
  id: string;
  provider: CalendarProvider;
  label: string;
  username: string;
  serverUrl: string | null;
  status: ConnectionStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface ProviderAccountsResponse {
  accounts: ProviderAccount[];
}

export interface ProviderAccountResponse {
  account: ProviderAccount;
}

export interface RemoteCalendar {
  remoteUrl: string;
  name: string;
  color: string | null;
  alreadyAdded: boolean;
}

export interface RemoteCalendarsResponse {
  calendars: RemoteCalendar[];
}

export interface CalendarConfig {
  id: string;
  accountId: string;
  accountLabel: string;
  provider: CalendarProvider;
  remoteUrl: string;
  name: string;
  color: string;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface CalendarConfigsResponse {
  calendars: CalendarConfig[];
}

export interface CalendarConfigResponse {
  calendar: CalendarConfig;
}

export type EventPrivacy = "shared" | "private" | "wall-hidden";

export type EventSource = "remote" | "local";

export interface FamilyEvent {
  id: string;
  calendarId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  memberIds: string[];
  tagMemberId: string | null;
  privacy: EventPrivacy;
  source: EventSource;
  /** True when memberIds were guessed from names in the title rather than assigned in the app. */
  membersInferred: boolean;
  /** Occurrence of a recurring series: edits and deletes must say whether they apply to this one or the whole series. */
  recurring: boolean;
  /** True when the viewer may only see that the slot is busy. */
  redacted: boolean;
}

export interface FamilyCalendar {
  id: string;
  name: string;
  color: string;
  /** Events cannot be created or changed here (e.g. Cookidoo meal plan). */
  readOnly: boolean;
  /** "meals": planned recipes, shown as a chef hat on the day instead of event cards. */
  kind: "events" | "meals";
  lastError: string | null;
  events: FamilyEvent[];
}

export interface CalendarResponse {
  range: { from: string; to: string };
  calendars: FamilyCalendar[];
}

export interface EventResponse {
  event: FamilyEvent;
}

/** A provider task list (Google Tasks) chosen by the Admin. */
export interface TaskListConfig {
  id: string;
  accountId: string;
  accountLabel: string;
  remoteId: string;
  name: string;
  color: string;
  enabled: boolean;
}

export interface TaskListConfigsResponse {
  lists: TaskListConfig[];
}

export interface TaskListConfigResponse {
  list: TaskListConfig;
}

export interface RemoteTaskList {
  remoteId: string;
  name: string;
  alreadyAdded: boolean;
}

export interface RemoteTaskListsResponse {
  lists: RemoteTaskList[];
}

export interface TaskItem {
  id: string;
  title: string;
  notes: string | null;
  completed: boolean;
  completedAt: string | null;
  due: string | null;
}

export interface FamilyTaskList {
  id: string;
  name: string;
  color: string;
  /** "reminders": family lists on the built-in CalDAV server, synced with iOS Reminders. */
  source: "google" | "reminders";
  lastError: string | null;
  tasks: TaskItem[];
}

export interface ListsResponse {
  lists: FamilyTaskList[];
}

export interface FamilyNote {
  id: string;
  title: string;
  body: string;
  color: string;
  pinned: boolean;
  /** Shown on the dashboard. */
  onDashboard: boolean;
  createdBy: string | null;
  updatedAt: string;
}

export interface NotesResponse {
  notes: FamilyNote[];
}

export interface NoteResponse {
  note: FamilyNote;
}

export interface GoogleAuthStartResponse {
  state: string;
  authUrl: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    database: { state: "ok" | "error"; detail: string };
  };
}
