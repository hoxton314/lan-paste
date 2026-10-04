import { Router } from 'express';
import type { Request, Response } from 'express';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  hashContent,
  DEDUP_WINDOW_MS,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  DEFAULT_MAX_TEXT_SIZE,
  MAX_EXPIRES_IN_SECONDS,
  SUPPORTED_IMAGE_TYPES,
} from '@lan-paste/shared';
import type { Clip, ClipResponse, ClipListResponse, ClipType } from '@lan-paste/shared';
import { getDb, NOT_EXPIRED } from '../db.js';
import { broadcastNewClip, broadcastClipDeleted, broadcastClipUpdated } from '../ws.js';
import { getBlobDir, getExtForMime, getStorageDir, resolveBlobPath, deleteBlobFile } from '../storage.js';
import { parsePlatform, upsertDevice } from '../devices.js';
import { toFtsQuery } from '../lib/search.js';
import { env } from '../env.js';
import { log } from '../logger.js';

export const clipsRouter = Router();

const upload = multer({
  limits: { fileSize: env.LAN_PASTE_MAX_CLIP_SIZE_MB * 1024 * 1024, files: 1 },
});

// Base64 envelope overhead for encrypted text (4/3 + header)
const MAX_ENCRYPTED_TEXT_SIZE = Math.ceil(DEFAULT_MAX_TEXT_SIZE * 1.4) + 64;

/** Headers that stop uploaded content (e.g. SVG with <script>, HTML files) executing on our origin */
const SAFE_BLOB_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  'X-Content-Type-Options': 'nosniff',
};

export function clipToResponse(clip: Clip, opts: { reveal?: boolean } = {}): ClipResponse {
  const { filepath, pinned, burn_after_read, encrypted, ...rest } = clip;
  const burn = !!burn_after_read;
  const hasBlob = clip.type !== 'text';
  return {
    ...rest,
    // One-time clips never expose content in listings/broadcasts — only via /reveal
    content: burn && !opts.reveal ? null : clip.content,
    pinned: !!pinned,
    burn_after_read: burn,
    encrypted: !!encrypted,
    // Inline URL only when the browser can render it directly (and viewing won't burn it)
    image_url: clip.type === 'image' && !burn && !encrypted ? `/api/clips/${clip.id}/image` : null,
    file_url: hasBlob ? `/api/clips/${clip.id}/file` : null,
  };
}

const boolish = z.preprocess(
  (v) => (typeof v === 'string' ? ['1', 'true', 'on', 'yes'].includes(v.toLowerCase()) : v),
  z.boolean(),
);

const pushOptionsSchema = z.object({
  expires_in: z.coerce.number().int().positive().max(MAX_EXPIRES_IN_SECONDS).optional(),
  burn_after_read: boolish.optional(),
  encrypted: boolish.optional(),
  target_device_id: z.string().min(1).max(128).optional(),
  platform: z.string().optional(),
});

const deviceSchema = z.object({
  device_id: z.string().min(1).max(128),
  device_name: z.string().min(1).max(128),
});

const pushTextSchema = pushOptionsSchema.merge(deviceSchema).extend({
  type: z.literal('text'),
  content: z.string().min(1),
}).superRefine((v, ctx) => {
  const max = v.encrypted ? MAX_ENCRYPTED_TEXT_SIZE : DEFAULT_MAX_TEXT_SIZE;
  if (Buffer.byteLength(v.content, 'utf8') > max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: `Text exceeds ${max} bytes` });
  }
});

const multipartSchema = pushOptionsSchema.merge(deviceSchema);

function checkDedup(hash: string, deviceId: string): Clip | undefined {
  return getDb().prepare(`
    SELECT * FROM clips
    WHERE hash = ? AND device_id = ? AND burn_after_read = 0 AND encrypted = 0
    AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
    AND ${NOT_EXPIRED}
    ORDER BY created_at DESC LIMIT 1
  `).get(hash, deviceId, `-${DEDUP_WINDOW_MS / 1000} seconds`) as Clip | undefined;
}

function expiresAt(expiresIn: number | undefined): string | null {
  return expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
}

function getVisibleClip(id: string): Clip | undefined {
  return getDb().prepare(`SELECT * FROM clips WHERE id = ? AND ${NOT_EXPIRED}`).get(id) as Clip | undefined;
}

function deleteClipAndBlob(clip: Clip): void {
  getDb().prepare('DELETE FROM clips WHERE id = ?').run(clip.id);
  if (clip.filepath) deleteBlobFile(clip.filepath);
  broadcastClipDeleted(clip.id);
}

function badRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: 'Invalid payload', details: error.flatten() });
}

// POST /api/clips — push a new clip: text (JSON) or image/file (multipart field `file` or `image`)
clipsRouter.post('/', upload.any(), (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const file = files.find((f) => f.fieldname === 'file' || f.fieldname === 'image');

  if (file) {
    const parsed = multipartSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, parsed.error);
    const opts = parsed.data;

    const mime = file.mimetype || 'application/octet-stream';
    const isImage = (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime);
    const type: ClipType = isImage ? 'image' : 'file';

    const hash = hashContent(file.buffer);
    if (!opts.burn_after_read && !opts.encrypted) {
      const existing = checkDedup(hash, opts.device_id);
      if (existing) {
        res.status(200).json(clipToResponse(existing));
        return;
      }
    }

    const id = nanoid();
    const ext = isImage ? getExtForMime(mime) : '.bin';
    const fullPath = join(getBlobDir(isImage ? 'images' : 'files'), `${id}${ext}`);
    writeFileSync(fullPath, file.buffer);
    // Store relative path from storage root
    const filepath = relative(getStorageDir(), fullPath);

    const clip = getDb().prepare(`
      INSERT INTO clips (id, type, filename, filepath, mime_type, size_bytes, hash, device_id, device_name,
                         expires_at, burn_after_read, encrypted, target_device_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      id, type, file.originalname || `${id}${ext}`, filepath, mime, file.size, hash,
      opts.device_id, opts.device_name, expiresAt(opts.expires_in),
      opts.burn_after_read ? 1 : 0, opts.encrypted ? 1 : 0, opts.target_device_id ?? null,
    ) as Clip;

    upsertDevice(opts.device_id, opts.device_name, parsePlatform(opts.platform));
    const response = clipToResponse(clip);
    broadcastNewClip(response, opts.device_id);
    log.debug(`[clips] ${type} ${id} from ${opts.device_name} (${file.size}B)`);
    res.status(201).json(response);
    return;
  }

  if (req.is('multipart/form-data')) {
    res.status(400).json({ error: 'Multipart push requires a `file` (or `image`) field' });
    return;
  }

  // Text push (JSON)
  const parsed = pushTextSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { content, device_id, device_name, ...opts } = parsed.data;
  const hash = hashContent(content);

  if (!opts.burn_after_read && !opts.encrypted) {
    const existing = checkDedup(hash, device_id);
    if (existing) {
      res.status(200).json(clipToResponse(existing));
      return;
    }
  }

  const id = nanoid();
  const clip = getDb().prepare(`
    INSERT INTO clips (id, type, content, mime_type, size_bytes, hash, device_id, device_name,
                       expires_at, burn_after_read, encrypted, target_device_id)
    VALUES (?, 'text', ?, 'text/plain', ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).get(
    id, content, Buffer.byteLength(content, 'utf8'), hash, device_id, device_name,
    expiresAt(opts.expires_in), opts.burn_after_read ? 1 : 0, opts.encrypted ? 1 : 0,
    opts.target_device_id ?? null,
  ) as Clip;

  upsertDevice(device_id, device_name, parsePlatform(opts.platform));
  const response = clipToResponse(clip);
  broadcastNewClip(response, device_id);
  log.debug(`[clips] text ${id} from ${device_name} (${clip.size_bytes}B)`);
  res.status(201).json(response);
});

// GET /api/clips/latest?device_id=<requesting device>
// Excludes the requester's own clips, clips targeted at other devices, and one-time clips.
clipsRouter.get('/latest', (req, res) => {
  const deviceId = typeof req.query.device_id === 'string' ? req.query.device_id : undefined;
  const conditions = [NOT_EXPIRED, 'burn_after_read = 0'];
  const params: unknown[] = [];

  if (deviceId) {
    conditions.push('device_id != ?', '(target_device_id IS NULL OR target_device_id = ?)');
    params.push(deviceId, deviceId);
  } else {
    conditions.push('target_device_id IS NULL');
  }

  const clip = getDb().prepare(`
    SELECT * FROM clips WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 1
  `).get(...params) as Clip | undefined;

  if (!clip) {
    res.status(204).send();
    return;
  }

  res.json(clipToResponse(clip));
});

// GET /api/clips?limit&offset&before&type&device_id&q&pinned
clipsRouter.get('/', (req, res) => {
  // Clamp: a negative LIMIT in SQLite means "no limit"
  const rawLimit = Math.floor(Number(req.query.limit)) || DEFAULT_HISTORY_LIMIT;
  const limit = Math.max(1, Math.min(rawLimit, MAX_HISTORY_LIMIT));
  const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
  const { type, device_id: deviceId, before, q, pinned } = req.query;

  const conditions: string[] = [NOT_EXPIRED];
  const params: unknown[] = [];

  if (type === 'text' || type === 'image' || type === 'file') {
    conditions.push('type = ?');
    params.push(type);
  }
  if (typeof deviceId === 'string' && deviceId) {
    conditions.push('device_id = ?');
    params.push(deviceId);
  }
  if (typeof before === 'string' && before) {
    conditions.push('created_at < ?');
    params.push(before);
  }
  if (pinned === 'true' || pinned === '1') {
    conditions.push('pinned = 1');
  }
  if (typeof q === 'string') {
    const fts = toFtsQuery(q);
    if (fts) {
      conditions.push('id IN (SELECT id FROM clips_fts WHERE clips_fts MATCH ?)');
      params.push(fts);
    }
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  const db = getDb();

  const total = (db.prepare(`SELECT COUNT(*) as count FROM clips ${where}`).get(...params) as { count: number }).count;
  const clips = db.prepare(`
    SELECT * FROM clips ${where} ORDER BY pinned DESC, created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Clip[];

  const response: ClipListResponse = {
    clips: clips.map((c) => clipToResponse(c)),
    total,
    limit,
    offset,
  };

  res.json(response);
});

function sendBlob(req: Request, res: Response, disposition: 'inline' | 'attachment'): void {
  const clip = getVisibleClip(String(req.params.id));
  if (!clip || clip.type === 'text' || !clip.filepath) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  if (disposition === 'inline' && (clip.type !== 'image' || clip.burn_after_read || clip.encrypted)) {
    res.status(404).json({ error: 'Image not available inline' });
    return;
  }

  res.set(SAFE_BLOB_HEADERS);
  if (disposition === 'attachment') res.attachment(clip.filename || `${clip.id}.bin`);
  res.type(clip.encrypted ? 'application/octet-stream' : clip.mime_type);

  res.sendFile(resolveBlobPath(clip.filepath), (err) => {
    if (err) {
      if (!res.headersSent) res.status(404).json({ error: 'File missing on disk' });
      return;
    }
    // One-time clip: gone after the first complete download
    if (clip.burn_after_read) deleteClipAndBlob(clip);
  });
}

// GET /api/clips/:id/image — inline image (not for one-time or encrypted clips)
clipsRouter.get('/:id/image', (req, res) => sendBlob(req, res, 'inline'));

// GET /api/clips/:id/file — download any image/file clip
clipsRouter.get('/:id/file', (req, res) => sendBlob(req, res, 'attachment'));

// POST /api/clips/:id/reveal — return a one-time text clip's content and delete it
clipsRouter.post('/:id/reveal', (req, res) => {
  const db = getDb();
  // Select + delete in one transaction so two concurrent reveals can't both succeed
  const clip = db.transaction(() => {
    const c = getVisibleClip(String(req.params.id));
    if (c && c.burn_after_read && c.type === 'text') db.prepare('DELETE FROM clips WHERE id = ?').run(c.id);
    return c;
  })();

  if (!clip) {
    res.status(404).json({ error: 'Clip not found (it may already have been read)' });
    return;
  }
  if (!clip.burn_after_read) {
    res.json(clipToResponse(clip));
    return;
  }
  if (clip.type !== 'text') {
    res.status(400).json({ error: 'One-time files are revealed by downloading file_url' });
    return;
  }

  broadcastClipDeleted(clip.id);
  res.json(clipToResponse(clip, { reveal: true }));
});

// GET /api/clips/:id
clipsRouter.get('/:id', (req, res) => {
  const clip = getVisibleClip(String(req.params.id));
  if (!clip) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }
  res.json(clipToResponse(clip));
});

const updateSchema = z.object({ pinned: z.boolean().optional() });

// PATCH /api/clips/:id — { pinned }
clipsRouter.patch('/:id', (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);

  const existing = getVisibleClip(String(req.params.id));
  if (!existing) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }

  let clip = existing;
  if (parsed.data.pinned !== undefined) {
    // Pinning keeps a clip forever, so it also clears any explicit expiry
    clip = getDb().prepare(`
      UPDATE clips SET pinned = ?, expires_at = CASE WHEN ? THEN NULL ELSE expires_at END
      WHERE id = ? RETURNING *
    `).get(parsed.data.pinned ? 1 : 0, parsed.data.pinned ? 1 : 0, existing.id) as Clip;
  }

  const response = clipToResponse(clip);
  broadcastClipUpdated(response);
  res.json(response);
});

// DELETE /api/clips/:id
clipsRouter.delete('/:id', (req, res) => {
  const clip = getDb().prepare('SELECT * FROM clips WHERE id = ?').get(String(req.params.id)) as Clip | undefined;
  if (!clip) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }
  deleteClipAndBlob(clip);
  res.status(204).send();
});
