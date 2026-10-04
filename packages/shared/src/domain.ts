export type UserRole = "Admin" | "Parent" | "Child" | "Kiosk";

export const USER_ROLES: readonly UserRole[] = ["Admin", "Parent", "Child", "Kiosk"];

export type Permission =
  | "calendar:read"
  | "events:write"
  | "members:manage"
  | "providers:manage"
  | "settings:manage";

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  Admin: ["calendar:read", "events:write", "members:manage", "providers:manage", "settings:manage"],
  Parent: ["calendar:read", "events:write"],
  Child: ["calendar:read"],
  Kiosk: ["calendar:read"]
};

export const hasPermission = (role: UserRole, permission: Permission): boolean =>
  ROLE_PERMISSIONS[role].includes(permission);

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
}

export type CalendarProvider = "icloud" | "caldav" | "cookidoo";

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

export interface WeatherSummary {
  temperatureC: number;
  condition: string;
  note: string;
}

export interface AgendaItem {
  id: string;
  memberId: string;
  memberName: string;
  memberAvatarUrl: string;
  today: string;
  time: string;
  status: "On track" | "Confirmed" | "Needs input" | "In progress";
}

export interface RoutineItem {
  id: string;
  title: string;
  ownerName: string;
  ownerAvatarUrl: string;
  cadence: string;
  completion: number;
}

export interface ReminderItem {
  id: string;
  title: string;
  note: string;
  severity: "Calm" | "Watch" | "Action";
}

export interface DashboardData {
  householdName: string;
  focusDateLabel: string;
  weather: WeatherSummary;
  agenda: AgendaItem[];
  routines: RoutineItem[];
  reminders: ReminderItem[];
}

export interface DashboardResponse {
  dashboard: DashboardData;
}

export interface FamilyList {
  id: string;
  title: string;
  description: string;
  itemCount: number;
  coverImageUrl: string;
}

export interface ListTask {
  id: string;
  task: string;
  ownerName: string;
  ownerAvatarUrl: string;
  due: string;
  status: "Open" | "Pending" | "In progress";
}

export interface ListsResponse {
  lists: FamilyList[];
  items: ListTask[];
}

export interface HealthResponse {
  status: "ok" | "degraded";
  services: {
    database: { state: "ok" | "error"; detail: string };
  };
}
