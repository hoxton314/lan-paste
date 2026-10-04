import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from './env.js';
import { log } from './logger.js';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Ordered schema migrations. `PRAGMA user_version` stores how many have been applied.
 * Never edit a released migration — append a new one.
 */
const migrations: Array<{ name: string; up: (db: Database.Database) => void }> = [
  {
    // Original schema. IF NOT EXISTS so pre-migration databases (user_version 0) adopt it as-is.
    name: 'initial',
    up: (db) => db.exec(`
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
    `),
  },
  {
    // Files, pinning, one-time clips, E2E flag, targeted clips, full-text search.
    // SQLite can't alter a CHECK constraint, so the clips table is rebuilt.
    name: 'files-pins-burn-e2e-target-fts',
    up: (db) => db.exec(`
      CREATE TABLE clips_new (
        id               TEXT PRIMARY KEY,
        type             TEXT NOT NULL CHECK (type IN ('text', 'image', 'file')),
        content          TEXT,
        filename         TEXT,
        filepath         TEXT,
        mime_type        TEXT NOT NULL,
        size_bytes       INTEGER NOT NULL,
        hash             TEXT NOT NULL,
        device_id        TEXT NOT NULL,
        device_name      TEXT NOT NULL,
        created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        expires_at       TEXT,
        pinned           INTEGER NOT NULL DEFAULT 0,
        burn_after_read  INTEGER NOT NULL DEFAULT 0,
        encrypted        INTEGER NOT NULL DEFAULT 0,
        target_device_id TEXT
      );

      INSERT INTO clips_new (id, type, content, filename, filepath, mime_type, size_bytes, hash,
                             device_id, device_name, created_at, expires_at)
      SELECT id, type, content, filename, filepath, mime_type, size_bytes, hash,
             device_id, device_name, created_at, expires_at
      FROM clips;

      DROP TABLE clips;
      ALTER TABLE clips_new RENAME TO clips;

      CREATE INDEX idx_clips_created_at ON clips(created_at DESC);
      CREATE INDEX idx_clips_hash ON clips(hash);
      CREATE INDEX idx_clips_device_id ON clips(device_id);
      CREATE INDEX idx_clips_expires_at ON clips(expires_at) WHERE expires_at IS NOT NULL;
      CREATE INDEX idx_clips_pinned ON clips(pinned) WHERE pinned = 1;

      -- Standalone FTS table keyed by clip id (external-content FTS would depend on
      -- rowids, which VACUUM may renumber since clips has a TEXT primary key).
      -- Encrypted and one-time clip contents are never indexed.
      CREATE VIRTUAL TABLE clips_fts USING fts5(
        id UNINDEXED, content, filename,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      INSERT INTO clips_fts (id, content, filename)
      SELECT id, content, filename FROM clips;

      CREATE TRIGGER clips_fts_insert AFTER INSERT ON clips BEGIN
        INSERT INTO clips_fts (id, content, filename) VALUES (
          new.id,
          CASE WHEN new.encrypted = 0 AND new.burn_after_read = 0 THEN new.content END,
          CASE WHEN new.encrypted = 0 THEN new.filename END
        );
      END;

      CREATE TRIGGER clips_fts_delete AFTER DELETE ON clips BEGIN
        DELETE FROM clips_fts WHERE id = old.id;
      END;
    `),
  },
];

export const SCHEMA_VERSION = migrations.length;

export function getSchemaVersion(): number {
  return getDb().pragma('user_version', { simple: true }) as number;
}

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > migrations.length) {
    throw new Error(
      `Database schema v${current} is newer than this server supports (v${migrations.length}). Upgrade lan-paste.`,
    );
  }
  for (let v = current; v < migrations.length; v++) {
    const m = migrations[v];
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${v + 1}`);
    })();
    log.info(`[db] Applied migration ${v + 1}: ${m.name}`);
  }
}

export function initDb(path = env.LAN_PASTE_DB_PATH): void {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
}

export function closeDb(): void {
  db?.close();
}

/** SQL fragment: clip is not expired. Use in every read so expiry is exact, not cleanup-interval-bound. */
export const NOT_EXPIRED = `(expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
