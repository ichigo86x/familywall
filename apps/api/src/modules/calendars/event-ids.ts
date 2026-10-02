/**
 * Provider events have no row of their own, so their public id encodes where they live.
 * Local events use their database UUID.
 */
const REMOTE_PREFIX = "r_";

export interface RemoteEventRef {
  calendarId: string;
  uid: string;
  occurrenceKey: string;
}

export const encodeRemoteEventId = (ref: RemoteEventRef): string =>
  REMOTE_PREFIX + Buffer.from(JSON.stringify([ref.calendarId, ref.uid, ref.occurrenceKey])).toString("base64url");

/**
 * Key of the app-metadata row (members, tag, privacy) for a provider event:
 * the uid applies to the whole series, uid::occurrence overrides a single occurrence.
 */
export const remoteMetaKey = (uid: string, occurrenceKey: string, scope: "occurrence" | "series"): string =>
  scope === "occurrence" && occurrenceKey ? `${uid}::${occurrenceKey}` : uid;

export const decodeRemoteEventId = (id: string): RemoteEventRef | null => {
  if (!id.startsWith(REMOTE_PREFIX)) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(id.slice(REMOTE_PREFIX.length), "base64url").toString("utf8"));
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => typeof part === "string")) {
      const [calendarId, uid, occurrenceKey] = parsed as [string, string, string];
      return { calendarId, uid, occurrenceKey };
    }
  } catch {
    // Fall through: malformed ids are treated as unknown.
  }
  return null;
};
