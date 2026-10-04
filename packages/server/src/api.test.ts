import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import type { ClipListResponse, ClipResponse } from '@lan-paste/shared';
import { createApp } from './app.js';
import { getDb, initDb } from './db.js';
import { runCleanup } from './cleanup.js';

let app: Application;

const dev = (id: string) => ({ device_id: id, device_name: `name-${id}` });

function pushText(content: string, extra: Record<string, unknown> = {}, device = 'a') {
  return request(app).post('/api/clips').send({ type: 'text', content, ...dev(device), ...extra });
}

async function list(query = ''): Promise<ClipListResponse> {
  const res = await request(app).get(`/api/clips${query}`).expect(200);
  return res.body;
}

beforeAll(() => {
  initDb(':memory:');
  app = createApp({ webDir: null });
});

describe('push & list', () => {
  it('pushes text and lists it', async () => {
    const res = await pushText('hello world').expect(201);
    expect(res.body).toMatchObject({ type: 'text', content: 'hello world', pinned: false, encrypted: false });
    expect((await list()).clips[0].id).toBe(res.body.id);
  });

  it('dedups identical pushes from the same device', async () => {
    const a = await pushText('dup me').expect(201);
    const b = await pushText('dup me').expect(200);
    expect(b.body.id).toBe(a.body.id);
  });

  it('rejects invalid payloads with JSON errors', async () => {
    await request(app).post('/api/clips').send({ type: 'text', content: '' }).expect(400);
    const bad = await request(app).post('/api/clips').set('Content-Type', 'application/json').send('{x').expect(400);
    expect(bad.body.error).toBe('Invalid JSON');
  });

  it('clamps limit (negative LIMIT would mean unlimited in SQLite)', async () => {
    const body = await list('?limit=-1');
    expect(body.limit).toBe(1);
    expect(body.clips).toHaveLength(1);
  });

  it('paginates with a before cursor', async () => {
    const all = await list('?limit=200');
    const first = await list('?limit=1');
    const next = await list(`?limit=1&before=${encodeURIComponent(first.clips[0].created_at)}`);
    expect(next.clips[0].id).toBe(all.clips[1].id);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error).toBe('Not found');
  });
});

describe('search', () => {
  it('finds by prefix and ignores diacritics', async () => {
    await pushText('Zażółć gęślą jaźń');
    await pushText('unrelated text');
    expect((await list('?q=zazo')).clips.map((c) => c.content)).toEqual(['Zażółć gęślą jaźń']);
    expect((await list('?q=g%C4%99%C5%9Bl')).total).toBe(1);
  });

  it('treats FTS syntax in user input literally', async () => {
    await request(app).get('/api/clips?q=%22OR%20NEAR(*').expect(200);
  });

  it('does not index one-time or encrypted content', async () => {
    await pushText('topsecretword', { burn_after_read: true });
    await pushText('topsecretword2', { encrypted: true });
    expect((await list('?q=topsecretword')).total).toBe(0);
  });
});

describe('pinning & retention', () => {
  it('pins, orders pinned first, and survives retention cleanup', async () => {
    const old = (await pushText('old pinned')).body as ClipResponse;
    const oldUnpinned = (await pushText('old unpinned')).body as ClipResponse;
    await pushText('newest');

    const patched = await request(app).patch(`/api/clips/${old.id}`).send({ pinned: true }).expect(200);
    expect(patched.body.pinned).toBe(true);
    expect((await list()).clips[0].id).toBe(old.id);

    getDb().prepare(`UPDATE clips SET created_at = '2000-01-01T00:00:00.000Z' WHERE id IN (?, ?)`).run(old.id, oldUnpinned.id);
    runCleanup();
    await request(app).get(`/api/clips/${old.id}`).expect(200);
    await request(app).get(`/api/clips/${oldUnpinned.id}`).expect(404);
  });
});

describe('expiry & one-time clips', () => {
  it('hides expired clips immediately, before cleanup runs', async () => {
    const clip = (await pushText('short lived', { expires_in: 60 })).body as ClipResponse;
    expect(clip.expires_at).not.toBeNull();
    getDb().prepare(`UPDATE clips SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(clip.id);
    await request(app).get(`/api/clips/${clip.id}`).expect(404);
  });

  it('withholds one-time content until revealed, then deletes it', async () => {
    const clip = (await pushText('burn me', { burn_after_read: true })).body as ClipResponse;
    expect(clip.content).toBeNull();
    expect((await list()).clips.find((c) => c.id === clip.id)?.content).toBeNull();

    const latest = await request(app).get('/api/clips/latest?device_id=zzz');
    expect(latest.body.id).not.toBe(clip.id);

    const revealed = await request(app).post(`/api/clips/${clip.id}/reveal`).expect(200);
    expect(revealed.body.content).toBe('burn me');
    await request(app).post(`/api/clips/${clip.id}/reveal`).expect(404);
  });
});

describe('files & images', () => {
  it('stores non-image uploads as files served as attachments', async () => {
    const res = await request(app).post('/api/clips')
      .field('device_id', 'a').field('device_name', 'A')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'evil.html', contentType: 'text/html' })
      .expect(201);
    expect(res.body).toMatchObject({ type: 'file', filename: 'evil.html', image_url: null });

    const dl = await request(app).get(res.body.file_url).expect(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['content-security-policy']).toContain('sandbox');
    await request(app).get(`/api/clips/${res.body.id}/image`).expect(404);
  });

  it('serves images inline with a sandbox CSP', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const res = await request(app).post('/api/clips')
      .field('device_id', 'a').field('device_name', 'A')
      .attach('image', Buffer.from(svg), { filename: 'x.svg', contentType: 'image/svg+xml' })
      .expect(201);
    expect(res.body.type).toBe('image');
    const img = await request(app).get(res.body.image_url).expect(200);
    expect(img.headers['content-security-policy']).toContain('sandbox');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
  });

  it('deletes a one-time file after its first download', async () => {
    const res = await request(app).post('/api/clips')
      .field('device_id', 'a').field('device_name', 'A').field('burn_after_read', 'true')
      .attach('file', Buffer.from('once'), { filename: 'once.txt', contentType: 'text/plain' })
      .expect(201);
    await request(app).get(res.body.file_url).expect(200);
    await new Promise((r) => setTimeout(r, 20));
    await request(app).get(res.body.file_url).expect(404);
  });

  it('rejects oversized uploads with 413 JSON', async () => {
    const res = await request(app).post('/api/clips')
      .field('device_id', 'a').field('device_name', 'A')
      .attach('file', Buffer.alloc(1024 * 1024 + 1), { filename: 'big.bin' })
      .expect(413);
    expect(res.body.error).toMatch(/too large/i);
  });
});

describe('targeting & devices', () => {
  it('latest excludes own clips and clips targeted at other devices', async () => {
    await pushText('for b only', { target_device_id: 'b' }, 'a');
    const forB = await request(app).get('/api/clips/latest?device_id=b').expect(200);
    expect(forB.body.content).toBe('for b only');
    const forC = await request(app).get('/api/clips/latest?device_id=c').expect(200);
    expect(forC.body.content).not.toBe('for b only');
    const forA = await request(app).get('/api/clips/latest?device_id=a');
    expect(forA.body?.device_id).not.toBe('a');
  });

  it('lists devices with platform', async () => {
    await pushText('from phone', { platform: 'ios' }, 'phone');
    const res = await request(app).get('/api/devices').expect(200);
    expect(res.body.devices.find((d: { id: string }) => d.id === 'phone')).toMatchObject({ platform: 'ios', online: false });
  });
});

describe('health', () => {
  it('reports version and schema version', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.body.schema_version).toBeGreaterThanOrEqual(2);
  });
});
