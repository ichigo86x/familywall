/**
 * Ordered schema migrations. The index + 1 is stored in PRAGMA user_version,
 * so never reorder or edit an entry that has shipped: append a new one.
 */
export const migrations: string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE members (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Parent', 'Child', 'Kiosk')),
    color TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 0,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE provider_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('icloud', 'caldav')),
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    server_url TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE calendars (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    remote_url TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (account_id, remote_url)
  );

  -- source = 'local': event created in the app, full data lives here.
  -- source = 'remote': app-only metadata (privacy, members, tag) for a provider event keyed by uid.
  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    uid TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('local', 'remote')),
    title TEXT,
    start_at TEXT,
    end_at TEXT,
    all_day INTEGER NOT NULL DEFAULT 0,
    privacy TEXT NOT NULL DEFAULT 'shared' CHECK (privacy IN ('shared', 'private', 'wall-hidden')),
    tag_member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
    created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (calendar_id, uid)
  );

  CREATE INDEX events_calendar_start ON events (calendar_id, start_at);

  CREATE TABLE event_members (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, member_id)
  );
  `,
  // Extra words (nicknames, abbreviations) that identify a member in event titles; JSON array.
  `
  ALTER TABLE members ADD COLUMN keywords TEXT NOT NULL DEFAULT '[]';
  `,
  // Cookidoo (Thermomix/Bimby) meal plan accounts: SQLite cannot alter a CHECK, so the table is rebuilt.
  `
  CREATE TABLE provider_accounts_new (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('icloud', 'caldav', 'cookidoo')),
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    server_url TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO provider_accounts_new SELECT id, provider, label, username, secret_enc, server_url, status, last_error, last_checked_at, created_at FROM provider_accounts;
  DROP TABLE provider_accounts;
  ALTER TABLE provider_accounts_new RENAME TO provider_accounts;
  `,
  // Google accounts (OAuth), Google Tasks lists chosen by the Admin, and the family notes board.
  `
  CREATE TABLE provider_accounts_new (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('icloud', 'caldav', 'cookidoo', 'google')),
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    server_url TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO provider_accounts_new SELECT id, provider, label, username, secret_enc, server_url, status, last_error, last_checked_at, created_at FROM provider_accounts;
  DROP TABLE provider_accounts;
  ALTER TABLE provider_accounts_new RENAME TO provider_accounts;

  CREATE TABLE task_lists (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    remote_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (account_id, remote_id)
  );

  CREATE TABLE notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES members(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // Notes shown on the dashboard, and household shifts (work location, chores, visits).
  `
  ALTER TABLE notes ADD COLUMN on_dashboard INTEGER NOT NULL DEFAULT 0;

  CREATE TABLE schedule_entries (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('work', 'chore', 'presence')),
    title TEXT NOT NULL,
    member_id TEXT REFERENCES members(id) ON DELETE CASCADE,
    person TEXT,
    weekdays TEXT NOT NULL DEFAULT '[]',
    week_parity TEXT NOT NULL DEFAULT 'all' CHECK (week_parity IN ('all', 'even', 'odd')),
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // Wall panels in write mode.
  `
  ALTER TABLE members ADD COLUMN panel_write INTEGER NOT NULL DEFAULT 0;
  `,
  // Birthdays: calendars marked as birthday calendars, and occasions kept in Familywall.
  `
  ALTER TABLE calendars ADD COLUMN purpose TEXT NOT NULL DEFAULT 'events' CHECK (purpose IN ('events', 'birthdays'));

  CREATE TABLE occasions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('birthday', 'anniversary', 'other')),
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    year INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  // Last provider events per calendar (background sync and offline fallback).
  `
  CREATE TABLE calendar_cache (
    calendar_id TEXT PRIMARY KEY REFERENCES calendars(id) ON DELETE CASCADE,
    window_from TEXT NOT NULL,
    window_to TEXT NOT NULL,
    events_json TEXT NOT NULL,
    synced_at TEXT NOT NULL
  );
  `,
  // Menus: calendars can be marked as menus (CHECK widened by rebuilding the table), and the family menu.
  `
  CREATE TABLE calendars_new (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE CASCADE,
    remote_url TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    last_synced_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'events' CHECK (purpose IN ('events', 'birthdays', 'meals')),
    UNIQUE (account_id, remote_url)
  );
  INSERT INTO calendars_new (id, account_id, remote_url, name, color, enabled, sort_order, last_synced_at, last_error, created_at, purpose)
    SELECT id, account_id, remote_url, name, color, enabled, sort_order, last_synced_at, last_error, created_at, purpose FROM calendars;
  DROP TABLE calendars;
  ALTER TABLE calendars_new RENAME TO calendars;

  CREATE TABLE menu_meals (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    slot TEXT NOT NULL CHECK (slot IN ('colazione', 'pranzo', 'merenda', 'cena')),
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL DEFAULT '[]',
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX menu_meals_date ON menu_meals (date);
  `,
  // Two-step sign-in (authenticator app) and the activity log.
  `
  ALTER TABLE members ADD COLUMN totp_secret_enc TEXT;
  ALTER TABLE members ADD COLUMN totp_pending_enc TEXT;
  ALTER TABLE members ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE members ADD COLUMN totp_last_step INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE members ADD COLUMN totp_recovery TEXT NOT NULL DEFAULT '[]';

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    member_id TEXT,
    username TEXT,
    action TEXT NOT NULL,
    request TEXT NOT NULL,
    status INTEGER NOT NULL,
    ip TEXT
  );
  CREATE INDEX audit_log_at ON audit_log (at);
  `,
  // iCloud Reminders through pyicloud (Apple ID login) and the "verify" status (two-factor code awaited).
  `
  CREATE TABLE provider_accounts_new (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('icloud', 'caldav', 'cookidoo', 'google', 'icloudweb')),
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    server_url TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO provider_accounts_new SELECT id, provider, label, username, secret_enc, server_url, status, last_error, last_checked_at, created_at FROM provider_accounts;
  DROP TABLE provider_accounts;
  ALTER TABLE provider_accounts_new RENAME TO provider_accounts;
  `,
  // ClasseViva school register accounts.
  `
  CREATE TABLE provider_accounts_new (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('icloud', 'caldav', 'cookidoo', 'google', 'icloudweb', 'classeviva')),
    label TEXT NOT NULL,
    username TEXT NOT NULL,
    secret_enc TEXT NOT NULL,
    server_url TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    last_error TEXT,
    last_checked_at TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO provider_accounts_new SELECT id, provider, label, username, secret_enc, server_url, status, last_error, last_checked_at, created_at FROM provider_accounts;
  DROP TABLE provider_accounts;
  ALTER TABLE provider_accounts_new RENAME TO provider_accounts;
  `,
  // A calendar may belong to a member (e.g. a child's ClasseViva register): its events take that member's colour.
  `
  ALTER TABLE calendars ADD COLUMN member_id TEXT;
  `
];
