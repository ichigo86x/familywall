import { z } from "zod";
import type { UserRole } from "./domain";

/** Services a dashboard button may call, per Home Assistant domain (anything else is refused). */
export const HOME_SERVICES: Record<string, ReadonlyArray<{ service: string; label: string }>> = {
  button: [{ service: "press", label: "Premi" }],
  input_button: [{ service: "press", label: "Premi" }],
  lock: [
    { service: "open", label: "Apri (sgancia la porta)" },
    { service: "unlock", label: "Sblocca" },
    { service: "lock", label: "Blocca" }
  ],
  cover: [
    { service: "toggle", label: "Apri/chiudi" },
    { service: "open_cover", label: "Apri" },
    { service: "close_cover", label: "Chiudi" }
  ],
  switch: [
    { service: "toggle", label: "Accendi/spegni" },
    { service: "turn_on", label: "Accendi" },
    { service: "turn_off", label: "Spegni" }
  ],
  light: [
    { service: "toggle", label: "Accendi/spegni" },
    { service: "turn_on", label: "Accendi" },
    { service: "turn_off", label: "Spegni" }
  ],
  fan: [
    { service: "toggle", label: "Accendi/spegni" },
    { service: "turn_on", label: "Accendi" },
    { service: "turn_off", label: "Spegni" }
  ],
  input_boolean: [
    { service: "toggle", label: "Attiva/disattiva" },
    { service: "turn_on", label: "Attiva" },
    { service: "turn_off", label: "Disattiva" }
  ],
  script: [{ service: "turn_on", label: "Esegui" }],
  scene: [{ service: "turn_on", label: "Attiva" }],
  automation: [{ service: "trigger", label: "Avvia" }]
};

export const homeDomain = (entityId: string): string => entityId.split(".")[0] ?? "";

export const isAllowedHomeService = (entityId: string, service: string): boolean =>
  (HOME_SERVICES[homeDomain(entityId)] ?? []).some((entry) => entry.service === service);

/** A dashboard shortcut to a Home Assistant entity (door opener, intercom, lights...). */
export interface HomeButton {
  id: string;
  label: string;
  /** One emoji shown on the button. */
  icon: string;
  entityId: string;
  service: string;
  /** Ask "Sei sicuro?" before calling the service (doors, gates). */
  confirm: boolean;
  /** Roles that see and use the button (Admin always can). */
  roles: UserRole[];
}

export interface HomeButtonView extends HomeButton {
  /** Current state of the entity ("on", "locked", "open"...), null when unknown. */
  state: string | null;
}

export interface HomeButtonsResponse {
  /** False when Familywall cannot reach Home Assistant (not an add-on and no HA_URL/HA_TOKEN). */
  available: boolean;
  buttons: HomeButtonView[];
}

export interface HomeEntity {
  entityId: string;
  name: string;
  state: string;
}

export const HOME_STATE_LABELS: Record<string, string> = {
  on: "acceso",
  off: "spento",
  open: "aperto",
  opening: "in apertura",
  closed: "chiuso",
  closing: "in chiusura",
  locked: "bloccato",
  unlocked: "sbloccato",
  unlocking: "in sblocco",
  locking: "in blocco",
  jammed: "inceppato",
  unavailable: "non disponibile"
};

/** A Home Assistant to-do list (todo.* entity) shown among the family lists: Apple Reminders via the iCloud integration, Bring!, Todoist... */
export interface HomeList {
  entityId: string;
  name: string;
  color: string;
}

/** A Home Assistant calendar (calendar.* entity) shown read-only among the family calendars. */
export interface HomeCalendar {
  entityId: string;
  name: string;
  color: string;
}

export const homeCalendarSchema = z.object({
  entityId: z.string().trim().regex(/^calendar\.[a-z0-9_]+$/, "Scegli un calendario calendar.*"),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});

/** Calendars of Home Assistant have ids "ha:<entity id>" in GET /calendars. */
/** A member and the person.* entity that tracks them in Home Assistant. */
export interface HomePresenceLink {
  memberId: string;
  entityId: string;
}

export const homePresenceLinkSchema = z.object({
  memberId: z.string().min(1).max(64),
  entityId: z.string().trim().regex(/^person\.[a-z0-9_]+$/, "Scegli un'entità person.*")
});

/** Where a member is: "home", "away" or the name of a Home Assistant zone ("Lavoro", "Scuola"). */
export interface HomePresence {
  memberId: string;
  state: "home" | "away" | "zone" | "unknown";
  zone: string | null;
  since: string | null;
}

export interface HomePresenceResponse {
  people: HomePresence[];
}

export const HOME_CALENDAR_PREFIX = "ha:";

export const homeListSchema = z.object({
  entityId: z.string().trim().regex(/^todo\.[a-z0-9_]+$/, "Scegli una lista todo.*"),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/)
});
