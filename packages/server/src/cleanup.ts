import { CLEANUP_INTERVAL_MS } from '@lan-paste/shared';
import { getDb } from './db.js';
import { env } from './env.js';

export function startCleanup(): void {
  const run = () => {
    const db = getDb();
    const retention = `-${env.LAN_PASTE_RETENTION_DAYS} days`;

    const result = db.prepare(`
      DELETE FROM clips
      WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
      OR (expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `).run(retention);

    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} expired clip(s)`);
    }
  };

  // Run once on startup, then periodically
  run();
  setInterval(run, CLEANUP_INTERVAL_MS);
}
