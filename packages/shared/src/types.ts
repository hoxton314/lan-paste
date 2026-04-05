export interface Clip {
  id: string;
  type: 'text' | 'image';
  content: string | null;
  filename: string | null;
  filepath: string | null;
  mime_type: string;
  size_bytes: number;
  hash: string;
  device_id: string;
  device_name: string;
  created_at: string;
  expires_at: string | null;
}

export interface ClipResponse extends Omit<Clip, 'filepath'> {
  image_url: string | null;
}

export interface Device {
  id: string;
  name: string;
  platform: 'linux' | 'windows' | 'ios' | 'web';
  last_seen: string;
  created_at: string;
}

export interface PushTextPayload {
  type: 'text';
  content: string;
  device_id: string;
  device_name: string;
}

export interface ClipListQuery {
  limit?: number;
  offset?: number;
  type?: 'text' | 'image';
  device_id?: string;
}

export interface ClipListResponse {
  clips: ClipResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
  uptime_seconds: number;
  clips_count: number;
}

// WebSocket protocol
export interface WsIdentify {
  type: 'identify';
  device_id: string;
  device_name: string;
}

export interface WsNewClip {
  type: 'new_clip';
  clip: ClipResponse;
}

export interface WsClipDeleted {
  type: 'clip_deleted';
  clip_id: string;
}

export interface WsPing {
  type: 'ping';
  timestamp: string;
}

export interface WsPong {
  type: 'pong';
}

export type WsServerMessage = WsNewClip | WsClipDeleted | WsPing;
export type WsClientMessage = WsIdentify | WsPong;

// Config
export interface LanPasteConfig {
  server: {
    url: string;
    api_key?: string;
  };
  device: {
    id: string;
    name: string;
  };
  sync: {
    auto: boolean;
    push: boolean;
    pull: boolean;
    images: boolean;
    max_size_mb: number;
  };
}
