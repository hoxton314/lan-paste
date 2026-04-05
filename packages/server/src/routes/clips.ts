import { Router } from 'express';
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
  SUPPORTED_IMAGE_TYPES,
} from '@lan-paste/shared';
import type { Clip, ClipResponse, ClipListResponse } from '@lan-paste/shared';
import { getDb } from '../db.js';
import { broadcastNewClip, broadcastClipDeleted } from '../ws.js';
import { getImageDir, getExtForMime, resolveImagePath, deleteImageFile } from '../storage.js';
import { env } from '../env.js';

export const clipsRouter = Router();

const upload = multer({
  limits: { fileSize: env.LAN_PASTE_MAX_CLIP_SIZE_MB * 1024 * 1024 },
});

function clipToResponse(clip: Clip): ClipResponse {
  const { filepath, ...rest } = clip;
  return {
    ...rest,
    image_url: clip.type === 'image' ? `/api/clips/${clip.id}/image` : null,
  };
}

const pushTextSchema = z.object({
  type: z.literal('text'),
  content: z.string().min(1).max(DEFAULT_MAX_TEXT_SIZE),
  device_id: z.string().min(1),
  device_name: z.string().min(1),
});

function upsertDevice(deviceId: string, deviceName: string) {
  getDb().prepare(`
    INSERT INTO devices (id, name) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(deviceId, deviceName);
}

function checkDedup(hash: string, deviceId: string): Clip | undefined {
  return getDb().prepare(`
    SELECT * FROM clips
    WHERE hash = ? AND device_id = ?
    AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(hash, deviceId, `-${DEDUP_WINDOW_MS / 1000} seconds`) as Clip | undefined;
}

// POST /api/clips — push a new clip (text JSON or image multipart)
clipsRouter.post('/', upload.single('image'), (req, res) => {
  // Image upload (multipart)
  if (req.file) {
    const file = req.file;
    const deviceId = (req.body.device_id as string) || '';
    const deviceName = (req.body.device_name as string) || '';

    if (!deviceId || !deviceName) {
      res.status(400).json({ error: 'device_id and device_name required' });
      return;
    }

    const mime = file.mimetype;
    if (!SUPPORTED_IMAGE_TYPES.includes(mime as typeof SUPPORTED_IMAGE_TYPES[number])) {
      res.status(400).json({ error: `Unsupported image type: ${mime}` });
      return;
    }

    const hash = hashContent(file.buffer);
    const existing = checkDedup(hash, deviceId);
    if (existing) {
      res.status(200).json(clipToResponse(existing));
      return;
    }

    const id = nanoid();
    const ext = getExtForMime(mime);
    const dir = getImageDir();
    const filename = `${id}${ext}`;
    const fullPath = join(dir, filename);

    writeFileSync(fullPath, file.buffer);

    // Store relative path from storage root
    const filepath = relative(env.LAN_PASTE_STORAGE_DIR, fullPath);

    const db = getDb();
    const clip = db.prepare(`
      INSERT INTO clips (id, type, filename, filepath, mime_type, size_bytes, hash, device_id, device_name)
      VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(id, file.originalname || filename, filepath, mime, file.size, hash, deviceId, deviceName) as Clip;

    upsertDevice(deviceId, deviceName);
    const response = clipToResponse(clip);
    broadcastNewClip(response, deviceId);
    res.status(201).json(response);
    return;
  }

  // Text push (JSON)
  const parsed = pushTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    return;
  }

  const { content, device_id, device_name } = parsed.data;
  const hash = hashContent(content);

  const existing = checkDedup(hash, device_id);
  if (existing) {
    res.status(200).json(clipToResponse(existing));
    return;
  }

  const id = nanoid();
  const db = getDb();
  const clip = db.prepare(`
    INSERT INTO clips (id, type, content, mime_type, size_bytes, hash, device_id, device_name)
    VALUES (?, 'text', ?, 'text/plain', ?, ?, ?, ?)
    RETURNING *
  `).get(id, content, Buffer.byteLength(content, 'utf8'), hash, device_id, device_name) as Clip;

  upsertDevice(device_id, device_name);
  const response = clipToResponse(clip);
  broadcastNewClip(response, device_id);
  res.status(201).json(response);
});

// GET /api/clips/latest
clipsRouter.get('/latest', (req, res) => {
  const excludeDevice = req.query.device_id as string | undefined;
  const db = getDb();

  let clip: Clip | undefined;
  if (excludeDevice) {
    clip = db.prepare(`
      SELECT * FROM clips WHERE device_id != ? ORDER BY created_at DESC LIMIT 1
    `).get(excludeDevice) as Clip | undefined;
  } else {
    clip = db.prepare(`
      SELECT * FROM clips ORDER BY created_at DESC LIMIT 1
    `).get() as Clip | undefined;
  }

  if (!clip) {
    res.status(204).send();
    return;
  }

  res.json(clipToResponse(clip));
});

// GET /api/clips
clipsRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || DEFAULT_HISTORY_LIMIT, MAX_HISTORY_LIMIT);
  const offset = Number(req.query.offset) || 0;
  const type = req.query.type as string | undefined;
  const deviceId = req.query.device_id as string | undefined;

  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type && (type === 'text' || type === 'image')) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (deviceId) {
    conditions.push('device_id = ?');
    params.push(deviceId);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM clips ${where}`).get(...params) as { count: number }).count;
  const clips = db.prepare(`
    SELECT * FROM clips ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as Clip[];

  const response: ClipListResponse = {
    clips: clips.map(clipToResponse),
    total,
    limit,
    offset,
  };

  res.json(response);
});

// GET /api/clips/:id/image — serve image binary
clipsRouter.get('/:id/image', (req, res) => {
  const db = getDb();
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as Clip | undefined;

  if (!clip || clip.type !== 'image' || !clip.filepath) {
    res.status(404).json({ error: 'Image not found' });
    return;
  }

  const fullPath = resolveImagePath(clip.filepath);
  res.type(clip.mime_type).sendFile(fullPath);
});

// GET /api/clips/:id
clipsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as Clip | undefined;

  if (!clip) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }

  res.json(clipToResponse(clip));
});

// DELETE /api/clips/:id
clipsRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const clip = db.prepare('SELECT * FROM clips WHERE id = ?').get(req.params.id) as Clip | undefined;

  if (!clip) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }

  // Delete image file from disk if it's an image
  if (clip.type === 'image' && clip.filepath) {
    deleteImageFile(clip.filepath);
  }

  db.prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);
  broadcastClipDeleted(req.params.id);
  res.status(204).send();
});
