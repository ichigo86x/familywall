import type { ScheduleEntry, ScheduleKind, User } from "@familywall/shared";

export const KIND_LABELS: Record<ScheduleKind, string> = {
  work: "Lavoro genitori",
  chore: "Faccende bambini",
  presence: "Presenze in casa"
};

export const WORK_MODES = ["Smart working", "Ufficio", "Trasferta", "Ferie", "Riposo"];
export const CHORE_SUGGESTIONS = ["Apparecchiare", "Sparecchiare", "Lavastoviglie", "Spazzatura", "Camera in ordine", "Dare da mangiare al gatto"];
export const PRESENCE_SUGGESTIONS = ["Pulizie", "Babysitter", "Nonni", "Stiro", "Giardiniere"];

/** Monday first, ISO numbers. */
export const WEEKDAY_LABELS: Array<{ iso: number; short: string }> = [
  { iso: 1, short: "Lun" },
  { iso: 2, short: "Mar" },
  { iso: 3, short: "Mer" },
  { iso: 4, short: "Gio" },
  { iso: 5, short: "Ven" },
  { iso: 6, short: "Sab" },
  { iso: 7, short: "Dom" }
];

/** A small emoji keeps entries readable from across the room on the wall panel. */
export const entryIcon = (entry: Pick<ScheduleEntry, "kind" | "title">): string => {
  const title = entry.title.toLowerCase();
  if (entry.kind === "work") {
    if (title.includes("smart") || title.includes("casa")) return "🏠";
    if (title.includes("ufficio")) return "🏢";
    if (title.includes("trasfert")) return "🧳";
    if (title.includes("ferie") || title.includes("riposo")) return "🌴";
    return "💼";
  }
  if (entry.kind === "chore") {
    if (title.includes("apparecch") || title.includes("sparecch")) return "🍽️";
    if (title.includes("lavastovigl")) return "🫧";
    if (title.includes("spazzatur")) return "🗑️";
    if (title.includes("gatto") || title.includes("cane")) return "🐾";
    return "🧹";
  }
  if (title.includes("pulizi") || title.includes("stiro")) return "🧽";
  if (title.includes("nonn")) return "👵";
  if (title.includes("baby")) return "🧸";
  return "🚪";
};

export const entryWho = (entry: ScheduleEntry, membersById: Map<string, User>): { name: string; color: string | null } => {
  const member = entry.memberId ? membersById.get(entry.memberId) : undefined;
  return { name: member?.displayName ?? entry.person ?? "", color: member?.color ?? null };
};

export const entryTime = (entry: ScheduleEntry): string =>
  entry.startTime ? (entry.endTime ? `${entry.startTime}–${entry.endTime}` : `dalle ${entry.startTime}`) : "";
