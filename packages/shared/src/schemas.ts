import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #RRGGBB color");
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "Use 3-32 characters: letters, digits, dot, dash or underscore");
const displayName = z.string().trim().min(1).max(60);
const password = z.string().min(8).max(128);
const isoDateTime = z.string().datetime({ offset: true });
const roleSchema = z.enum(["Admin", "Parent", "Child", "Kiosk"]);
const keywords = z.array(z.string().trim().min(2).max(30)).max(10);

export const setupSchema = z.object({
  householdName: z.string().trim().min(2).max(80),
  username,
  displayName,
  password: z.string().min(10).max(128),
  color: hexColor.default("#3A7D6E")
});

export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(128)
});

export type LoginInput = z.infer<typeof loginSchema>;

export const createMemberSchema = z.object({
  username,
  displayName,
  role: roleSchema,
  color: hexColor,
  password,
  keywords: keywords.default([])
});

/** Input shape: keywords may be omitted and default to none. */
export type CreateMemberInput = z.input<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    displayName: displayName.optional(),
    role: roleSchema.optional(),
    color: hexColor.optional(),
    disabled: z.boolean().optional(),
    keywords: keywords.optional()
  })
  .strict();

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const setPasswordSchema = z.object({
  password,
  currentPassword: z.string().max(128).optional()
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const updateSettingsSchema = z
  .object({
    householdName: z.string().trim().min(2).max(80).optional(),
    locale: z.string().trim().min(2).max(20).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    wallModeEnabled: z.boolean().optional()
  })
  .strict();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const createProviderAccountSchema = z
  .object({
    provider: z.enum(["icloud", "caldav"]),
    label: z.string().trim().min(1).max(80),
    username: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(200),
    serverUrl: z.string().trim().url().optional()
  })
  .refine((value) => value.provider !== "caldav" || Boolean(value.serverUrl), {
    message: "serverUrl is required for CalDAV accounts",
    path: ["serverUrl"]
  });

export type CreateProviderAccountInput = z.infer<typeof createProviderAccountSchema>;

export const addCalendarSchema = z.object({
  accountId: z.string().min(1),
  remoteUrl: z.string().url(),
  name: z.string().trim().min(1).max(80),
  color: hexColor
});

export type AddCalendarInput = z.infer<typeof addCalendarSchema>;

export const updateCalendarSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: hexColor.optional(),
    enabled: z.boolean().optional()
  })
  .strict();

export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

export const calendarRangeSchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional()
  })
  .refine((value) => !value.from || !value.to || new Date(value.to) > new Date(value.from), {
    message: "to must be after from",
    path: ["to"]
  });

export type CalendarRangeInput = z.infer<typeof calendarRangeSchema>;

const privacySchema = z.enum(["shared", "private", "wall-hidden"]);

/** For recurring events: change only the selected occurrence or the whole series. */
export const recurrenceScopeSchema = z.enum(["occurrence", "series"]);

export type RecurrenceScope = z.infer<typeof recurrenceScopeSchema>;

export const createEventSchema = z
  .object({
    calendarId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    startAt: isoDateTime,
    endAt: isoDateTime,
    allDay: z.boolean().default(false),
    memberIds: z.array(z.string().min(1)).max(20).default([]),
    tagMemberId: z.string().min(1).nullable().default(null),
    privacy: privacySchema.default("shared")
  })
  .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"]
  });

export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startAt: isoDateTime.optional(),
    endAt: isoDateTime.optional(),
    allDay: z.boolean().optional(),
    memberIds: z.array(z.string().min(1)).max(20).optional(),
    tagMemberId: z.string().min(1).nullable().optional(),
    privacy: privacySchema.optional(),
    scope: recurrenceScopeSchema.optional()
  })
  .strict()
  .refine((value) => !value.startAt || !value.endAt || new Date(value.endAt) > new Date(value.startAt), {
    message: "endAt must be after startAt",
    path: ["endAt"]
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const deleteEventQuerySchema = z.object({
  scope: recurrenceScopeSchema.optional()
});

export type DeleteEventQuery = z.infer<typeof deleteEventQuerySchema>;
