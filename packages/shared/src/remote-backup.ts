import { z } from "zod";

/** Daily copy of the backup on a WebDAV folder outside the house (Nextcloud, Synology, QNAP, any WebDAV server). */
export interface RemoteBackupSettings {
  enabled: boolean;
  /** WebDAV folder, e.g. https://cloud.example.com/remote.php/dav/files/mario/Familywall/ */
  url: string | null;
  username: string | null;
  /** Remote copies kept (older ones are deleted). */
  keep: number;
}

export const DEFAULT_REMOTE_BACKUP: RemoteBackupSettings = { enabled: false, url: null, username: null, keep: 14 };

export const remoteBackupSchema = z.object({
  enabled: z.boolean(),
  url: z.string().trim().url().max(500).refine((value) => value.startsWith("https://") || value.startsWith("http://"), "Usa un indirizzo http(s)").nullable(),
  username: z.string().trim().max(200).nullable(),
  keep: z.number().int().min(1).max(90),
  /** Unchanged when omitted. */
  password: z.string().max(200).optional(),
  /** Unchanged when omitted; at least 12 characters. */
  passphrase: z.string().min(12, "Almeno 12 caratteri").max(200).optional()
});

export type RemoteBackupInput = z.infer<typeof remoteBackupSchema>;

export interface RemoteBackupStatus {
  settings: RemoteBackupSettings;
  passwordSet: boolean;
  passphraseSet: boolean;
  lastSuccess: string | null;
  lastError: string | null;
}
