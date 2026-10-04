import ICAL from "ical.js";

/**
 * Builds a VTIMEZONE for an IANA zone from the runtime's time zone data (Intl), so new
 * recurring events keep their wall-clock time across daylight saving changes.
 * The yearly rules are derived from the transitions of the current year.
 */

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** UTC offset of a zone at an instant, in minutes east of UTC. */
export const zoneOffsetMinutes = (timeZone: string, instant: Date): number => {
  const label =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(instant).find((part) => part.type === "timeZoneName")
      ?.value ?? "GMT";
  const match = label.match(/GMT([+-])(\d{2}):(\d{2})/);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
};

interface Transition {
  /** Local wall time just before the change, expressed as UTC fields. */
  local: Date;
  from: number;
  to: number;
}

const transitionsOfYear = (timeZone: string, year: number): Transition[] => {
  const transitions: Transition[] = [];
  let previous = zoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 0, 1, 12)));

  for (let day = Date.UTC(year, 0, 2, 12); day < Date.UTC(year + 1, 0, 1, 12); day += DAY) {
    const offset = zoneOffsetMinutes(timeZone, new Date(day));
    if (offset === previous) {
      continue;
    }

    // Binary search for the minute the offset changes within the last day.
    let low = day - DAY;
    let high = day;
    while (high - low > 60_000) {
      const middle = low + Math.floor((high - low) / 120_000) * 60_000;
      if (zoneOffsetMinutes(timeZone, new Date(middle)) === previous) {
        low = middle;
      } else {
        high = middle;
      }
    }
    transitions.push({ local: new Date(high + previous * 60_000), from: previous, to: offset });
    previous = offset;
  }

  return transitions;
};

const formatOffset = (minutes: number): string => {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
};

const pad = (value: number): string => String(value).padStart(2, "0");

/** First date in 1970 matching "n-th (or last) weekday of month", used as the rule's DTSTART. */
const ruleStart1970 = (month: number, weekday: number, ordinal: number, local: Date): string => {
  const daysInMonth = new Date(Date.UTC(1970, month + 1, 0)).getUTCDate();
  const candidates = Array.from({ length: daysInMonth }, (_, index) => index + 1).filter(
    (day) => new Date(Date.UTC(1970, month, day)).getUTCDay() === weekday
  );
  const day = ordinal === -1 ? candidates[candidates.length - 1]! : candidates[ordinal - 1]!;
  return `1970${pad(month + 1)}${pad(day)}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`;
};

const observance = (transition: Transition): string[] => {
  const { local } = transition;
  const day = local.getUTCDate();
  const month = local.getUTCMonth();
  const weekday = local.getUTCDay();
  const daysInMonth = new Date(Date.UTC(local.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const ordinal = day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
  const kind = transition.to > transition.from ? "DAYLIGHT" : "STANDARD";

  return [
    `BEGIN:${kind}`,
    `DTSTART:${ruleStart1970(month, weekday, ordinal, local)}`,
    `RRULE:FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${ordinal}${WEEKDAYS[weekday]}`,
    `TZOFFSETFROM:${formatOffset(transition.from)}`,
    `TZOFFSETTO:${formatOffset(transition.to)}`,
    `END:${kind}`
  ];
};

export const buildVTimezone = (timeZone: string, year = new Date().getUTCFullYear()): ICAL.Component => {
  const transitions = transitionsOfYear(timeZone, year);
  const fixed = zoneOffsetMinutes(timeZone, new Date(Date.UTC(year, 0, 1, 12)));
  const body =
    transitions.length > 0
      ? transitions.flatMap(observance)
      : ["BEGIN:STANDARD", "DTSTART:19700101T000000", `TZOFFSETFROM:${formatOffset(fixed)}`, `TZOFFSETTO:${formatOffset(fixed)}`, "END:STANDARD"];

  const text = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`, ...body, "END:VTIMEZONE"].join("\r\n");
  return new ICAL.Component(ICAL.parse(text));
};
