import type { Application } from 'express';
import type WebSocket from 'ws';
import expressWs from 'express-ws';
import { WS_PING_INTERVAL_MS, WS_PONG_TIMEOUT_MS } from '@lan-paste/shared';
import type { ClipResponse, WsServerMessage } from '@lan-paste/shared';

interface ConnectedClient {
  ws: WebSocket;
  device_id: string;
  device_name: string;
  alive: boolean;
}

const clients = new Map<WebSocket, ConnectedClient>();

export function setupWebSocket(app: Application): void {
  const wsInstance = expressWs(app);

  wsInstance.app.ws('/ws', (ws, _req) => {
    const client: ConnectedClient = { ws, device_id: '', device_name: '', alive: true };
    clients.set(ws, client);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'identify') {
          client.device_id = msg.device_id || '';
          client.device_name = msg.device_name || '';
          console.log(`[ws] Device connected: ${client.device_name} (${client.device_id})`);
        }
        if (msg.type === 'pong') {
          client.alive = true;
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      console.log(`[ws] Device disconnected: ${client.device_name}`);
      clients.delete(ws);
    });

    ws.on('error', () => {
      clients.delete(ws);
    });
  });

  // Ping/pong keepalive
  setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      client.alive = false;
      const ping: WsServerMessage = { type: 'ping', timestamp: new Date().toISOString() };
      try {
        ws.send(JSON.stringify(ping));
      } catch {
        clients.delete(ws);
      }
    }
  }, WS_PING_INTERVAL_MS);
}

export function broadcastNewClip(clip: ClipResponse, excludeDeviceId: string): void {
  const msg: WsServerMessage = { type: 'new_clip', clip };
  const data = JSON.stringify(msg);

  for (const [ws, client] of clients) {
    if (client.device_id === excludeDeviceId) continue;
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}

export function broadcastClipDeleted(clipId: string): void {
  const msg: WsServerMessage = { type: 'clip_deleted', clip_id: clipId };
  const data = JSON.stringify(msg);

  for (const [ws, client] of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
}
