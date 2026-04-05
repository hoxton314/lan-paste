import { useEffect, useRef, useCallback } from 'react';
import type { WsNewClip, WsClipDeleted } from '@lan-paste/shared';
import { getDeviceId, getDeviceName } from '../lib/device.js';

interface UseWebSocketOptions {
  onNewClip: (msg: WsNewClip) => void;
  onClipDeleted: (msg: WsClipDeleted) => void;
}

export function useWebSocket({ onNewClip, onClipDeleted }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectDelay = useRef<number>(1000);

  const connect = useCallback(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = 1000;
      ws.send(JSON.stringify({
        type: 'identify',
        device_id: getDeviceId(),
        device_name: getDeviceName(),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; [key: string]: unknown };
        if (msg.type === 'new_clip') onNewClip(msg as unknown as WsNewClip);
        if (msg.type === 'clip_deleted') onClipDeleted(msg as unknown as WsClipDeleted);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000);
        connect();
      }, reconnectDelay.current);
    };

    ws.onerror = () => ws.close();
  }, [onNewClip, onClipDeleted]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
