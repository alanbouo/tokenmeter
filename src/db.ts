import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { LEGACY_PROFILE } from "./profiles.js";

export function defaultDbPath(): string {
  return join(homedir(), ".tokenmeter", "tokenmeter.db");
}

export function openDb(path: string = defaultDbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      message_id TEXT PRIMARY KEY,
      profile TEXT NOT NULL DEFAULT 'perso',
      timestamp TEXT NOT NULL,
      model TEXT NOT NULL,
      project TEXT NOT NULL,
      session_id TEXT NOT NULL,
      is_sidechain INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_1h_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_5m_tokens INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ingest_state (
      file_path TEXT PRIMARY KEY,
      bytes_read INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile TEXT NOT NULL DEFAULT 'perso',
      timestamp TEXT NOT NULL,
      weekly_pct REAL NOT NULL,
      session_pct REAL,
      dirty INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile TEXT NOT NULL DEFAULT 'perso',
      window TEXT NOT NULL,
      reset_label TEXT NOT NULL,
      reset_at TEXT,
      observed_at TEXT NOT NULL,
      UNIQUE (profile, window, reset_label)
    );

    CREATE TABLE IF NOT EXISTS calibrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile TEXT NOT NULL DEFAULT 'perso',
      computed_at TEXT NOT NULL,
      estimated_stock_usd REAL,
      dispersion_usd REAL,
      intervals_used INTEGER NOT NULL
    );
  `);

  migrateToProfiles(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project);
    CREATE INDEX IF NOT EXISTS idx_events_profile_timestamp ON events (profile, timestamp);
    CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings (timestamp);
    CREATE INDEX IF NOT EXISTS idx_readings_profile_timestamp ON readings (profile, timestamp);
  `);
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[];
  return cols.some((c) => c.name === column);
}

// Databases created before profiles existed hold a single account's data:
// it all becomes the legacy profile. `resets` is rebuilt because its UNIQUE
// constraint has to include the profile, and SQLite can't alter a constraint.
function migrateToProfiles(db: DatabaseSync): void {
  const legacy = `'${LEGACY_PROFILE}'`;
  for (const table of ["events", "readings", "calibrations"]) {
    if (!hasColumn(db, table, "profile")) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN profile TEXT NOT NULL DEFAULT ${legacy}`);
    }
  }
  if (!hasColumn(db, "resets", "profile")) {
    db.exec(`
      BEGIN;
      ALTER TABLE resets RENAME TO resets_old;
      CREATE TABLE resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile TEXT NOT NULL DEFAULT ${legacy},
        window TEXT NOT NULL,
        reset_label TEXT NOT NULL,
        reset_at TEXT,
        observed_at TEXT NOT NULL,
        UNIQUE (profile, window, reset_label)
      );
      INSERT INTO resets (id, profile, window, reset_label, reset_at, observed_at)
        SELECT id, ${legacy}, window, reset_label, reset_at, observed_at FROM resets_old;
      DROP TABLE resets_old;
      COMMIT;
    `);
  }
}

