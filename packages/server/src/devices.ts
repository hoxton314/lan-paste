import type { DevicePlatform } from '@lan-paste/shared';
import { getDb } from './db.js';

export const PLATFORMS: readonly DevicePlatform[] = ['linux', 'windows', 'macos', 'ios', 'android', 'web'];

export function parsePlatform(value: unknown): DevicePlatform | null {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value)
    ? (value as DevicePlatform)
    : null;
}

/** Insert or refresh a device. A null platform keeps the stored one (or 'web' for new devices). */
export function upsertDevice(id: string, name: string, platform: DevicePlatform | null = null): void {
  getDb().prepare(`
    INSERT INTO devices (id, name, platform) VALUES (?, ?, COALESCE(?, 'web'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      platform = COALESCE(?, devices.platform),
      last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(id, name, platform, platform);
}

export function touchDevice(id: string): void {
  getDb().prepare(`UPDATE devices SET last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(id);
}
