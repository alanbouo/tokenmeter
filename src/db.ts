import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_project ON events (project);

    CREATE TABLE IF NOT EXISTS ingest_state (
      file_path TEXT PRIMARY KEY,
      bytes_read INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      weekly_pct REAL NOT NULL,
      session_pct REAL,
      dirty INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual'
    );

    CREATE INDEX IF NOT EXISTS idx_readings_timestamp ON readings (timestamp);

    CREATE TABLE IF NOT EXISTS resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      window TEXT NOT NULL,
      reset_label TEXT NOT NULL,
      reset_at TEXT,
      observed_at TEXT NOT NULL,
      UNIQUE (window, reset_label)
    );
  `);
}
