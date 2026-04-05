import { Router } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
  hashContent,
  DEDUP_WINDOW_MS,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  DEFAULT_MAX_TEXT_SIZE,
} from '@lan-paste/shared';
import type { Clip, ClipResponse, ClipListResponse } from '@lan-paste/shared';
import { getDb } from '../db.js';

export const clipsRouter = Router();

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

// POST /api/clips — push a new clip
clipsRouter.post('/', (req, res) => {
  const parsed = pushTextSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    return;
  }

  const { content, device_id, device_name } = parsed.data;
  const hash = hashContent(content);

  // Dedup: check for same hash from same device within window
  const db = getDb();
  const existing = db.prepare(`
    SELECT * FROM clips
    WHERE hash = ? AND device_id = ?
    AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(hash, device_id, `-${DEDUP_WINDOW_MS / 1000} seconds`) as Clip | undefined;

  if (existing) {
    res.status(200).json(clipToResponse(existing));
    return;
  }

  const id = nanoid();
  const clip = db.prepare(`
    INSERT INTO clips (id, type, content, mime_type, size_bytes, hash, device_id, device_name)
    VALUES (?, 'text', ?, 'text/plain', ?, ?, ?, ?)
    RETURNING *
  `).get(id, content, Buffer.byteLength(content, 'utf8'), hash, device_id, device_name) as Clip;

  // Upsert device
  db.prepare(`
    INSERT INTO devices (id, name) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_seen = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `).run(device_id, device_name);

  res.status(201).json(clipToResponse(clip));
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
  const result = db.prepare('DELETE FROM clips WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Clip not found' });
    return;
  }

  res.status(204).send();
});
