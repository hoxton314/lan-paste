import { CLEANUP_INTERVAL_MS } from '@lan-paste/shared';
import type { Clip } from '@lan-paste/shared';
import { getDb } from './db.js';
import { env } from './env.js';
import { log } from './logger.js';
import { deleteBlobFile } from './storage.js';
import { broadcastClipDeleted } from './ws.js';

/** Delete expired clips (explicit expires_at, or older than retention unless pinned). Returns count. */
export function runCleanup(): number {
  const db = getDb();
  // RETENTION_DAYS <= 0 disables age-based expiry (explicit expires_at still applies)
  const ageBased = env.LAN_PASTE_RETENTION_DAYS > 0;
  const retention = `-${env.LAN_PASTE_RETENTION_DAYS} days`;

  const expired = db.prepare(`
    SELECT * FROM clips
    WHERE (? AND pinned = 0 AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?))
      OR (expires_at IS NOT NULL AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  `).all(ageBased ? 1 : 0, retention) as Clip[];

  if (expired.length === 0) return 0;

  const del = db.prepare('DELETE FROM clips WHERE id = ?');
  db.transaction((clips: Clip[]) => {
    for (const clip of clips) del.run(clip.id);
  })(expired);

  for (const clip of expired) {
    if (clip.filepath) deleteBlobFile(clip.filepath);
    broadcastClipDeleted(clip.id);
  }

  log.info(`[cleanup] Deleted ${expired.length} expired clip(s)`);
  return expired.length;
}

export function startCleanup(): NodeJS.Timeout {
  runCleanup();
  return setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}
