export const DEFAULT_PORT = 3456;
export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_RETENTION_DAYS = 7;
export const DEFAULT_MAX_CLIP_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_MAX_TEXT_SIZE = 1 * 1024 * 1024; // 1MB
export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 200;
export const DEDUP_WINDOW_MS = 5000;
export const WS_PING_INTERVAL_MS = 30_000;
export const WS_PONG_TIMEOUT_MS = 10_000;
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;

export const CONFIG_DIR = '.config/lan-paste';
export const CONFIG_FILENAME = 'config.toml';
export const DATA_DIR = '.local/share/lan-paste';
