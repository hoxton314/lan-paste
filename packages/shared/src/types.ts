export type ClipType = 'text' | 'image' | 'file';
export type DevicePlatform = 'linux' | 'windows' | 'macos' | 'ios' | 'android' | 'web';

export interface Clip {
  id: string;
  type: ClipType;
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
  /** 1 = never removed by retention cleanup */
  pinned: number;
  /** 1 = content withheld from listings; deleted after the first reveal/download */
  burn_after_read: number;
  /** 1 = content / file bytes are end-to-end encrypted (see @lan-paste/shared/crypto) */
  encrypted: number;
  /** When set, only this device should auto-apply the clip */
  target_device_id: string | null;
}

export interface ClipResponse
  extends Omit<Clip, 'filepath' | 'pinned' | 'burn_after_read' | 'encrypted'> {
  pinned: boolean;
  burn_after_read: boolean;
  encrypted: boolean;
  /** Inline-viewable URL, only for type === 'image' */
  image_url: string | null;
  /** Download URL (Content-Disposition: attachment), for image and file clips */
  file_url: string | null;
}

export interface Device {
  id: string;
  name: string;
  platform: DevicePlatform;
  last_seen: string;
  created_at: string;
}

export interface DeviceResponse extends Device {
  online: boolean;
}

export interface DeviceListResponse {
  devices: DeviceResponse[];
}

/** Optional push options, shared by JSON (text) and multipart (image/file) pushes */
export interface PushOptions {
  /** Seconds until the clip expires */
  expires_in?: number;
  burn_after_read?: boolean;
  encrypted?: boolean;
  target_device_id?: string;
}

export interface PushTextPayload extends PushOptions {
  type: 'text';
  content: string;
  device_id: string;
  device_name: string;
}

export interface UpdateClipPayload {
  pinned?: boolean;
}

export interface ClipListQuery {
  limit?: number;
  offset?: number;
  /** Cursor: only clips created strictly before this ISO timestamp */
  before?: string;
  type?: ClipType;
  device_id?: string;
  /** Full-text search over text content and filenames */
  q?: string;
  pinned?: boolean;
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
  schema_version: number;
}

// WebSocket protocol
export interface WsIdentify {
  type: 'identify';
  device_id: string;
  device_name: string;
  platform?: DevicePlatform;
}

export interface WsNewClip {
  type: 'new_clip';
  clip: ClipResponse;
}

export interface WsClipUpdated {
  type: 'clip_updated';
  clip: ClipResponse;
}

export interface WsClipDeleted {
  type: 'clip_deleted';
  clip_id: string;
}

/** Sent when a device connects/disconnects or is renamed — clients should refetch /api/devices */
export interface WsDevicesChanged {
  type: 'devices_changed';
}

export interface WsPing {
  type: 'ping';
  timestamp: string;
}

export interface WsPong {
  type: 'pong';
}

export type WsServerMessage = WsNewClip | WsClipUpdated | WsClipDeleted | WsDevicesChanged | WsPing;
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
  encryption: {
    enabled: boolean;
    passphrase: string;
  };
}
