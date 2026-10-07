/**
 * Last API answers saved on the device, so a wall panel or a phone keeps showing the latest
 * data when the connection or the server drops. Only GET answers are saved; they are wiped
 * at logout and pruned after a few days.
 */
const PREFIX = "familywall.cache:";
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;

interface Entry {
  savedAt: number;
  body: unknown;
}

const keys = (): string[] => {
  try {
    return Object.keys(window.localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return [];
  }
};

const read = (key: string): Entry | null => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry) : null;
  } catch {
    return null;
  }
};

export const offlineCache = {
  save(path: string, body: unknown): void {
    try {
      window.localStorage.setItem(PREFIX + path, JSON.stringify({ savedAt: Date.now(), body } satisfies Entry));
    } catch {
      // Storage full or blocked: drop the oldest entries and give up for this answer.
      this.prune(10);
      return;
    }
    this.prune(MAX_ENTRIES);
  },

  load(path: string): Entry | null {
    const entry = read(PREFIX + path);
    return entry && Date.now() - entry.savedAt < MAX_AGE_MS ? entry : null;
  },

  prune(keep: number): void {
    const entries = keys()
      .map((key) => ({ key, savedAt: read(key)?.savedAt ?? 0 }))
      .sort((left, right) => right.savedAt - left.savedAt);
    entries
      .filter((entry, index) => index >= keep || Date.now() - entry.savedAt > MAX_AGE_MS)
      .forEach((entry) => {
        try {
          window.localStorage.removeItem(entry.key);
        } catch {
          // Ignore: nothing else to do.
        }
      });
  },

  clear(): void {
    keys().forEach((key) => {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // Ignore.
      }
    });
  }
};

type Listener = (state: ConnectionState) => void;

export interface ConnectionState {
  online: boolean;
  /** Time of the oldest saved answer shown while offline. */
  dataTime: Date | null;
}

let state: ConnectionState = { online: true, dataTime: null };
const listeners = new Set<Listener>();

const publish = (next: ConnectionState) => {
  if (next.online === state.online && next.dataTime?.getTime() === state.dataTime?.getTime()) {
    return;
  }
  state = next;
  listeners.forEach((listener) => listener(state));
};

export const connection = {
  get: (): ConnectionState => state,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  markOnline: () => publish({ online: true, dataTime: null }),
  markOffline: (savedAt: number) => {
    const time = new Date(savedAt);
    publish({ online: false, dataTime: state.dataTime && state.dataTime < time ? state.dataTime : time });
  }
};
