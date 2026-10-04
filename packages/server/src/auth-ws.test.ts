import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

// env.ts is parsed at import time, so set the key before loading the app
process.env.LAN_PASTE_API_KEY = 'sekret';
const { createApp } = await import('./app.js');
const { initDb } = await import('./db.js');

let server: Server;
let base: string;

beforeAll(async () => {
  initDb(':memory:');
  const app = createApp({ webDir: null });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
});

function openWs(query: string): Promise<{ ws: WebSocket; messages: Array<Record<string, unknown>>; closeCode: Promise<number> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws${query}`);
    const messages: Array<Record<string, unknown>> = [];
    const closeCode = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
    ws.addEventListener('message', (e) => messages.push(JSON.parse(String(e.data))));
    ws.addEventListener('open', () => setTimeout(() => resolve({ ws, messages, closeCode }), 50));
    ws.addEventListener('error', () => resolve({ ws, messages, closeCode }));
    setTimeout(() => reject(new Error('ws timeout')), 3000);
  });
}

const waitFor = async (pred: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('API key', () => {
  it('rejects REST calls without the key', async () => {
    await request(`http://${base}`).get('/api/clips').expect(401);
    await request(`http://${base}`).get('/api/clips').set('Authorization', 'Bearer wrong').expect(401);
    await request(`http://${base}`).get('/api/clips').set('Authorization', 'Bearer sekret').expect(200);
    await request(`http://${base}`).get('/api/clips?api_key=sekret').expect(200);
  });

  it('closes unauthenticated WebSockets with 4401', async () => {
    const { closeCode } = await openWs('');
    expect(await closeCode).toBe(4401);
  });
});

describe('WebSocket broadcast & presence', () => {
  it('broadcasts new clips to other devices, not the sender, and tracks presence', async () => {
    const a = await openWs('?api_key=sekret');
    const b = await openWs('?api_key=sekret');
    a.ws.send(JSON.stringify({ type: 'identify', device_id: 'dev-a', device_name: 'A', platform: 'linux' }));
    b.ws.send(JSON.stringify({ type: 'identify', device_id: 'dev-b', device_name: 'B', platform: 'android' }));
    await waitFor(() => b.messages.some((m) => m.type === 'devices_changed'));

    const devices = await request(`http://${base}`).get('/api/devices?api_key=sekret').expect(200);
    const online = devices.body.devices.filter((d: { online: boolean }) => d.online).map((d: { id: string }) => d.id);
    expect(online.sort()).toEqual(['dev-a', 'dev-b']);

    await request(`http://${base}`).post('/api/clips?api_key=sekret')
      .send({ type: 'text', content: 'live!', device_id: 'dev-a', device_name: 'A' }).expect(201);

    await waitFor(() => b.messages.some((m) => m.type === 'new_clip'));
    expect(a.messages.some((m) => m.type === 'new_clip')).toBe(false);

    b.ws.close();
    await waitFor(() => a.messages.filter((m) => m.type === 'devices_changed').length >= 2);
    a.ws.close();
  });
});
