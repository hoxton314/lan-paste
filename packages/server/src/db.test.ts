import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, initDb, SCHEMA_VERSION, closeDb } from './db.js';
import { toFtsQuery } from './lib/search.js';

describe('migrations', () => {
  it('upgrades a pre-migration (v0) database in place, keeping data', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lan-paste-mig-')), 'old.db');
    const old = new Database(path);
    old.exec(`
      CREATE TABLE clips (
        id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('text', 'image')), content TEXT,
        filename TEXT, filepath TEXT, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        hash TEXT NOT NULL, device_id TEXT NOT NULL, device_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), expires_at TEXT
      );
      CREATE TABLE devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL DEFAULT 'linux',
        last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
      INSERT INTO clips (id, type, content, mime_type, size_bytes, hash, device_id, device_name)
      VALUES ('legacy1', 'text', 'legacy searchable', 'text/plain', 17, 'h', 'd', 'D');
    `);
    old.close();

    initDb(path);
    const db = getDb();
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT pinned, encrypted FROM clips WHERE id = ?').get('legacy1')).toEqual({ pinned: 0, encrypted: 0 });
    expect(db.prepare(`SELECT id FROM clips_fts WHERE clips_fts MATCH '"legacy"*'`).all()).toEqual([{ id: 'legacy1' }]);
    // 'file' type is now allowed
    db.prepare(`INSERT INTO clips (id, type, mime_type, size_bytes, hash, device_id, device_name)
                VALUES ('f1', 'file', 'application/pdf', 1, 'h', 'd', 'D')`).run();
    closeDb();

    // Re-opening is a no-op
    initDb(path);
    expect(getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    closeDb();
  });
});

describe('toFtsQuery', () => {
  it('quotes terms as prefix queries and strips quotes', () => {
    expect(toFtsQuery('foo  "bar')).toBe('"foo"* "bar"*');
    expect(toFtsQuery('   ')).toBeNull();
  });
});
