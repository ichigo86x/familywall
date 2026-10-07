import { z } from "zod";

export type OccasionKind = "birthday" | "anniversary" | "other";

/** A yearly occasion kept in Familywall (birthdays, anniversaries...). */
export interface Occasion {
  id: string;
  name: string;
  kind: OccasionKind;
  month: number;
  day: number;
  /** Year of birth or of the event: shows the age or the years. */
  year: number | null;
}

export interface OccasionsResponse {
  occasions: Occasion[];
}

/** Id of the virtual calendar that carries the occasions in GET /calendars. */
export const OCCASIONS_CALENDAR_ID = "occasions";

export const OCCASION_ICONS: Record<OccasionKind, string> = { birthday: "🎂", anniversary: "💍", other: "⭐" };
export const OCCASION_LABELS: Record<OccasionKind, string> = { birthday: "Compleanno", anniversary: "Anniversario", other: "Ricorrenza" };

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const occasionSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["birthday", "anniversary", "other"]).default("birthday"),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    year: z.number().int().min(1900).max(2100).nullable().default(null)
  })
  .refine((value) => value.day <= DAYS_IN_MONTH[value.month - 1]!, { path: ["day"], message: "Giorno non valido per il mese" });

export type OccasionInput = z.input<typeof occasionSchema>;

/** The date of the occasion in a given year (29 February falls on the 28th in other years). */
export const occasionDate = (occasion: Pick<Occasion, "month" | "day">, year: number): Date => {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = occasion.month === 2 && occasion.day === 29 && !leap ? 28 : occasion.day;
  return new Date(year, occasion.month - 1, day);
};

/** "🎂 Luca (9)": the number is the age or the years since, when the year is known. */
export const occasionTitle = (occasion: Pick<Occasion, "name" | "kind" | "year">, year: number): string =>
  `${OCCASION_ICONS[occasion.kind]} ${occasion.name}${occasion.year && year > occasion.year ? ` (${year - occasion.year})` : ""}`;
