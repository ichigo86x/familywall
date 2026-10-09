import { z } from "zod";
import type { CalendarProvider } from "./domain";

/** Family data that can live on the built-in server or on a calendar of the family's provider. */
export type FamilyDataKind = "menu" | "occasions";

/** Setting value for the built-in CalDAV server (null = automatic). */
export const INTERNAL_TARGET = "internal";

/** Providers whose calendars Familywall can write menu and birthdays to. */
export const FAMILY_TARGET_PROVIDERS: readonly CalendarProvider[] = ["icloud", "caldav", "google"];

/** Calendar purpose that goes with each kind of family data. */
export const FAMILY_TARGET_PURPOSE = { menu: "meals", occasions: "birthdays" } as const;

export interface FamilyTargetOption {
  /** INTERNAL_TARGET or the id of a calendar configured in Admin. */
  id: string;
  name: string;
  provider: CalendarProvider | "internal";
  accountLabel: string | null;
}

export interface FamilyTargetInfo {
  kind: FamilyDataKind;
  /** What the Admin chose: null = automatic (a calendar marked for this use, else the built-in server). */
  setting: string | null;
  /** Where the data is read and written now. */
  current: FamilyTargetOption;
  options: FamilyTargetOption[];
  /** Items still on the built-in server while a provider calendar is used (shown apart, to move). */
  leftover: number;
}

export interface FamilyTargetsResponse {
  menu: FamilyTargetInfo;
  occasions: FamilyTargetInfo;
}

export const setFamilyTargetSchema = z.object({
  /** null = automatic. */
  target: z.string().trim().min(1).max(64).nullable(),
  /** Moves what is on the current calendar to the new one (copied, then deleted from the old one). */
  move: z.boolean().default(false)
});

export type SetFamilyTargetInput = z.input<typeof setFamilyTargetSchema>;

export interface SetFamilyTargetResponse {
  target: FamilyTargetInfo;
  moved: number;
  /** Items that could not be moved (left where they were). */
  failed: number;
}
