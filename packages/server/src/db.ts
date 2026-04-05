import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from './env.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function initDb(): void {
  mkdirSync(dirname(env.LAN_PASTE_DB_PATH), { recursive: true });

  db = new Database(env.LAN_PASTE_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id          TEXT PRIMARY KEY,
      type        TEXT NOT NULL CHECK (type IN ('text', 'image')),
      content     TEXT,
      filename    TEXT,
      filepath    TEXT,
      mime_type   TEXT NOT NULL,
      size_bytes  INTEGER NOT NULL,
      hash        TEXT NOT NULL,
      device_id   TEXT NOT NULL,
      device_name TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_clips_created_at ON clips(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clips_hash ON clips(hash);
    CREATE INDEX IF NOT EXISTS idx_clips_device_id ON clips(device_id);

    CREATE TABLE IF NOT EXISTS devices (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      platform    TEXT NOT NULL DEFAULT 'linux',
      last_seen   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
}
