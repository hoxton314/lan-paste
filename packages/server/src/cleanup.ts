import { CLEANUP_INTERVAL_MS } from '@lan-paste/shared';
import type { Clip } from '@lan-paste/shared';
import { getDb } from './db.js';
import { env } from './env.js';
import { deleteImageFile } from './storage.js';

export function startCleanup(): void {
  const run = () => {
    const db = getDb();
    const retention = `-${env.LAN_PASTE_RETENTION_DAYS} days`;

    // First, find image clips that will be deleted so we can clean up files
    const expiredImages = db.prepare(`
      SELECT * FROM clips
      WHERE type = 'image' AND filepath IS NOT NULL
      AND (created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
        OR (expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
    `).all(retention) as Clip[];

    for (const clip of expiredImages) {
      if (clip.filepath) deleteImageFile(clip.filepath);
    }

    const result = db.prepare(`
      DELETE FROM clips
      WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
      OR (expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `).run(retention);

    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} expired clip(s)`);
    }
  };

  run();
  setInterval(run, CLEANUP_INTERVAL_MS);
}
