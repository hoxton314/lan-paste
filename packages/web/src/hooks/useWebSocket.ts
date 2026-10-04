import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsNewClip, WsClipDeleted, WsClipUpdated } from '@lan-paste/shared';
import { getDeviceId, getDeviceName, getPlatform } from '../lib/device.js';
import { withApiKey } from '../lib/api.js';

interface UseWebSocketOptions {
  onNewClip: (msg: WsNewClip) => void;
  onClipUpdated: (msg: WsClipUpdated) => void;
  onClipDeleted: (msg: WsClipDeleted) => void;
  onDevicesChanged: () => void;
  /** Called after a reconnect, so missed clips can be re-fetched */
  onReconnect?: () => void;
}

function identifyMessage(): string {
  return JSON.stringify({
    type: 'identify',
    device_id: getDeviceId(),
    device_name: getDeviceName(),
    platform: getPlatform(),
  });
}

export function useWebSocket(opts: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Keep latest handlers in a ref so the socket isn't torn down when they change
  const handlers = useRef(opts);
  handlers.current = opts;

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 1000;
    let disposed = false;
    let hasConnected = false;

    const connect = () => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(withApiKey(`${protocol}//${location.host}/ws`));
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectDelay = 1000;
        setConnected(true);
        socket.send(identifyMessage());
        if (hasConnected) handlers.current.onReconnect?.();
        hasConnected = true;
      };

      socket.onmessage = (event) => {
        let msg: { type: string; [key: string]: unknown };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        const h = handlers.current;
        if (msg.type === 'new_clip') h.onNewClip(msg as unknown as WsNewClip);
        else if (msg.type === 'clip_updated') h.onClipUpdated(msg as unknown as WsClipUpdated);
        else if (msg.type === 'clip_deleted') h.onClipDeleted(msg as unknown as WsClipDeleted);
        else if (msg.type === 'devices_changed') h.onDevicesChanged();
        else if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
      };

      socket.onclose = () => {
        setConnected(false);
        // Don't resurrect the socket after unmount (e.g. StrictMode double-mount)
        if (disposed) return;
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
          connect();
        }, reconnectDelay);
      };

      socket.onerror = () => socket.close();
    };

    connect();

    // Mobile browsers suspend sockets in background; reconnect immediately on return
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || disposed) return;
      if (wsRef.current?.readyState === WebSocket.CLOSED) {
        clearTimeout(reconnectTimeout);
        reconnectDelay = 1000;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      clearTimeout(reconnectTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      wsRef.current?.close();
    };
  }, []);

  /** Re-send identify (e.g. after renaming this device) */
  const reidentify = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(identifyMessage());
  }, []);

  return { connected, reidentify };
}
