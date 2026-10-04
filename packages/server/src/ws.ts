import type { Application } from 'express';
import type WebSocket from 'ws';
import expressWs from 'express-ws';
import { WS_PING_INTERVAL_MS } from '@lan-paste/shared';
import type { ClipResponse, WsServerMessage } from '@lan-paste/shared';
import { isAuthorized } from './middleware/auth.js';
import { parsePlatform, touchDevice, upsertDevice } from './devices.js';
import { log } from './logger.js';

interface ConnectedClient {
  ws: WebSocket;
  device_id: string;
  device_name: string;
  alive: boolean;
}

const clients = new Map<WebSocket, ConnectedClient>();

const WS_OPEN = 1;

function safeSend(ws: WebSocket, data: string): void {
  if (ws.readyState !== WS_OPEN) return;
  try {
    ws.send(data);
  } catch {
    clients.delete(ws);
  }
}

function broadcast(msg: WsServerMessage, excludeDeviceId?: string): void {
  const data = JSON.stringify(msg);
  for (const [ws, client] of clients) {
    if (excludeDeviceId && client.device_id === excludeDeviceId) continue;
    safeSend(ws, data);
  }
}

/** Device IDs with at least one open, identified connection */
export function getOnlineDeviceIds(): Set<string> {
  const ids = new Set<string>();
  for (const client of clients.values()) {
    if (client.device_id) ids.add(client.device_id);
  }
  return ids;
}

function removeClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;
  clients.delete(ws);
  if (client.device_id) {
    log.info(`[ws] Device disconnected: ${client.device_name} (${client.device_id})`);
    try {
      touchDevice(client.device_id);
    } catch {
      // DB may be closed during shutdown
    }
    if (!getOnlineDeviceIds().has(client.device_id)) broadcast({ type: 'devices_changed' });
  }
}

export function setupWebSocket(app: Application): void {
  const wsInstance = expressWs(app);

  wsInstance.app.ws('/ws', (ws, req) => {
    // Same API key rules as the REST API (key passed via ?api_key=)
    if (!isAuthorized(req)) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    const client: ConnectedClient = { ws, device_id: '', device_name: '', alive: true };
    clients.set(ws, client);

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return; // ignore malformed messages
      }
      if (msg.type === 'identify' && typeof msg.device_id === 'string' && msg.device_id) {
        client.device_id = msg.device_id;
        client.device_name = typeof msg.device_name === 'string' && msg.device_name ? msg.device_name : msg.device_id;
        upsertDevice(client.device_id, client.device_name, parsePlatform(msg.platform));
        log.info(`[ws] Device connected: ${client.device_name} (${client.device_id})`);
        broadcast({ type: 'devices_changed' });
      }
      if (msg.type === 'pong') {
        client.alive = true;
      }
    });

    ws.on('close', () => removeClient(ws));
    ws.on('error', () => removeClient(ws));
  });

  // Ping/pong keepalive
  setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive) {
        ws.terminate();
        removeClient(ws);
        continue;
      }
      client.alive = false;
      const ping: WsServerMessage = { type: 'ping', timestamp: new Date().toISOString() };
      safeSend(ws, JSON.stringify(ping));
    }
  }, WS_PING_INTERVAL_MS).unref();
}

export function broadcastNewClip(clip: ClipResponse, excludeDeviceId: string): void {
  broadcast({ type: 'new_clip', clip }, excludeDeviceId);
}

export function broadcastClipUpdated(clip: ClipResponse): void {
  broadcast({ type: 'clip_updated', clip });
}

export function broadcastClipDeleted(clipId: string): void {
  broadcast({ type: 'clip_deleted', clip_id: clipId });
}

export function broadcastDevicesChanged(): void {
  broadcast({ type: 'devices_changed' });
}
