import type { HomeButton, HomeCalendar, HomeList, HomePresenceLink } from "./home";
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
  /** Sign-in asks a code of an authenticator app after the password. */
  totpEnabled: boolean;
}

/** A new authenticator secret, to scan or type in the app; confirmed with a first code. */
export interface TotpSetupResponse {
  secret: string;
  otpauthUrl: string;
}

/** One-time codes for when the phone with the authenticator app is lost (shown once). */
export interface TotpEnabledResponse {
  recoveryCodes: string[];
}

/** One change made in Familywall: who, what, when, and how it went. */
export interface AuditEntry {
  id: number;
  at: string;
  memberId: string | null;
  username: string | null;
  /** "Membri: modifica", "Accesso", "Backup: ripristino"... */
  action: string;
  /** Method and path, e.g. "PATCH /members/3f2a…". */
  request: string;
  status: number;
  ip: string | null;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  /** Pass as ?before= to read older entries; null at the end. */
  nextBefore: number | null;
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
  /** Home Assistant shortcuts on the dashboard. */
  homeButtons: HomeButton[];
  /** Home Assistant to-do lists shown in Liste. */
  homeLists: HomeList[];
  /** Home Assistant calendars shown (read-only) in the calendar. */
  homeCalendars: HomeCalendar[];
  /** Settings of single wall panels, by Kiosk member id (missing = like the family). */
  panelProfiles: Record<string, PanelProfile>;
  /** Members linked to a person.* entity of Home Assistant: the dashboard shows who is at home. */
  homePresence: HomePresenceLink[];
  /** Where the family menu is kept: null = automatic, "internal" = built-in server, else a calendar id. */
  menuCalendarId: string | null;
  /** Where birthdays and anniversaries are kept (same values as menuCalendarId). */
  occasionsCalendarId: string | null;
}

/** What one wall panel shows differently from the others (e.g. the kitchen and the hall). */
export interface PanelProfile {
  /** Room shown in Admin, e.g. "Cucina". */
  room: string;
  /** Lists on its dashboard; null = the family choice. */
  dashboardListIds: string[] | null;
  /** Home Assistant buttons shown on it; null = all those allowed to panels. */
  homeButtonIds: string[] | null;
  /** Its own night hours; null = the family ones. */
  night: PanelNight | null;
  /** Minutes without touches before the screensaver; 0 = never; null = the default (5). */
  screensaverMinutes: number | null;
}

export const DEFAULT_SCREENSAVER_MINUTES = 5;

/** The settings a wall panel actually uses: its own profile over the family ones. */
export const panelView = (
  settings: Pick<HouseholdSettings, "dashboardListIds" | "panelNight" | "panelProfiles">,
  memberId: string | null | undefined
): { dashboardListIds: string[]; night: PanelNight; screensaverMinutes: number; homeButtonIds: string[] | null } => {
  const profile = memberId ? settings.panelProfiles?.[memberId] : undefined;
  return {
    dashboardListIds: profile?.dashboardListIds ?? settings.dashboardListIds,
    night: profile?.night ?? settings.panelNight,
    screensaverMinutes: profile?.screensaverMinutes ?? DEFAULT_SCREENSAVER_MINUTES,
    homeButtonIds: profile?.homeButtonIds ?? null
  };
};

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

/** "icloudweb": Apple ID login through pyicloud, for iCloud Reminders (the "icloud" accounts use CalDAV with an app password). */
/** "classeviva": the ClasseViva school register (homework and tests), read-only. */
export type CalendarProvider = "icloud" | "caldav" | "cookidoo" | "google" | "icloudweb" | "classeviva";

/** Providers Familywall can only read from (no event writes). */
export const READ_ONLY_PROVIDERS: readonly CalendarProvider[] = ["cookidoo", "classeviva"];

/** "verify": iCloud waits for the two-factor code sent to the trusted devices. */
export type ConnectionStatus = "ok" | "error" | "unknown" | "verify";

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
  /** "birthdays": birthdays and anniversaries; "meals": a menu (dishes, ingredients in the description). */
  purpose: "events" | "birthdays" | "meals";
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
  /** Menu calendars only: the description (ingredients), one per line. */
  notes?: string | null;
}

export interface FamilyCalendar {
  id: string;
  name: string;
  color: string;
  /** Events cannot be created or changed here (e.g. Cookidoo meal plan). */
  readOnly: boolean;
  /** "meals": planned recipes, shown as a chef hat on the day; "birthdays": birthdays and anniversaries, shown as a cake. */
  /** "school": homework and tests from the school register. */
  kind: "events" | "meals" | "birthdays" | "school";
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
  source: "google" | "reminders" | "homeassistant" | "icloud";
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
