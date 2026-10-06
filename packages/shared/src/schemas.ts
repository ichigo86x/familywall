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

export const createMemberSchema = z
  .object({
    username,
    displayName,
    role: roleSchema,
    color: hexColor,
    password: password.optional(),
    keywords: keywords.default([]),
    /** false = tag-only member (children only): no password, never signs in. */
    loginEnabled: z.boolean().default(true)
  })
  .superRefine((input, context) => {
    if (input.loginEnabled && !input.password) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password obbligatoria" });
    }
    if (!input.loginEnabled && input.role !== "Child") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["loginEnabled"], message: "Solo i figli possono essere senza accesso" });
    }
  });

/** Input shape: keywords may be omitted and default to none. */
export type CreateMemberInput = z.input<typeof createMemberSchema>;

export const updateMemberSchema = z
  .object({
    displayName: displayName.optional(),
    role: roleSchema.optional(),
    color: hexColor.optional(),
    disabled: z.boolean().optional(),
    keywords: keywords.optional(),
    /** Only false is accepted: it removes the password. Setting a password enables sign-in again. */
    loginEnabled: z.literal(false).optional()
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
    wallModeEnabled: z.boolean().optional(),
    dashboardListIds: z.array(z.string().min(1).max(300)).max(20).optional()
  })
  .strict();

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

export const createProviderAccountSchema = z
  .object({
    provider: z.enum(["icloud", "caldav", "cookidoo"]),
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

export const weekdaySchema = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

export type Weekday = z.infer<typeof weekdaySchema>;

/** Repetition of a new event; written to the provider as an RRULE. */
export const recurrenceRuleSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(99).default(1),
    /** Weekly only; empty = same weekday as the start. */
    weekdays: z.array(weekdaySchema).max(7).default([]),
    /** Last day (YYYY-MM-DD, inclusive). */
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    count: z.number().int().min(1).max(999).optional()
  })
  .refine((rule) => !(rule.until && rule.count), {
    message: "Usa una data di fine oppure un numero di ripetizioni, non entrambi",
    path: ["count"]
  });

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;
export type RecurrenceRuleInput = z.input<typeof recurrenceRuleSchema>;

export const createEventSchema = z
  .object({
    calendarId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    startAt: isoDateTime,
    endAt: isoDateTime,
    allDay: z.boolean().default(false),
    memberIds: z.array(z.string().min(1)).max(20).default([]),
    tagMemberId: z.string().min(1).nullable().default(null),
    privacy: privacySchema.default("shared"),
    recurrence: recurrenceRuleSchema.nullable().default(null)
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

export const googleAuthStartSchema = z.object({
  label: z.string().trim().min(1).max(80),
  clientId: z.string().trim().min(10).max(300),
  clientSecret: z.string().trim().min(5).max(300),
  /** Must be registered on the OAuth client (or a loopback address for desktop clients). */
  redirectUri: z.string().trim().url()
});

export type GoogleAuthStartInput = z.infer<typeof googleAuthStartSchema>;

export const googleAuthCompleteSchema = z.object({
  state: z.string().min(8).max(200),
  /** The address Google redirected to (contains ?code=...), pasted by the Admin. */
  redirectedUrl: z.string().trim().min(10).max(4000)
});

export type GoogleAuthCompleteInput = z.infer<typeof googleAuthCompleteSchema>;

export const addTaskListSchema = z.object({
  accountId: z.string().min(1),
  remoteId: z.string().min(1).max(300),
  name: z.string().trim().min(1).max(80),
  color: hexColor
});

export type AddTaskListInput = z.infer<typeof addTaskListSchema>;

export const updateTaskListSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: hexColor.optional(),
    enabled: z.boolean().optional()
  })
  .strict();

export type UpdateTaskListInput = z.infer<typeof updateTaskListSchema>;

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(500)
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    completed: z.boolean().optional()
  })
  .strict();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const noteSchema = z.object({
  title: z.string().trim().max(120).default(""),
  body: z.string().max(5000).default(""),
  color: hexColor.default("#FFF4B8"),
  pinned: z.boolean().default(false),
  onDashboard: z.boolean().default(false)
});

export type NoteInput = z.input<typeof noteSchema>;

export const updateNoteSchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    body: z.string().max(5000).optional(),
    color: hexColor.optional(),
    pinned: z.boolean().optional(),
    onDashboard: z.boolean().optional()
  })
  .strict();

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const dashboardListsSchema = z.object({
  listIds: z.array(z.string().min(1).max(300)).max(20)
});

export type DashboardListsInput = z.infer<typeof dashboardListsSchema>;
