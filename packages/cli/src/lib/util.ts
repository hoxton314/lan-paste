import { existsSync } from 'node:fs';
import { extname, basename, join, dirname } from 'node:path';
import { platform } from 'node:os';
import type { ClipResponse, DevicePlatform } from '@lan-paste/shared';

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

/** Parse "30s", "10m", "2h", "1d", "1w" (or a bare number of seconds) into seconds. */
export function parseDuration(input: string): number {
  const m = /^\s*(\d+)\s*([smhdw]?)\s*$/i.exec(input);
  if (!m) throw new Error(`Invalid duration "${input}" (use e.g. 30s, 10m, 2h, 1d)`);
  const seconds = Number(m[1]) * DURATION_UNITS[(m[2] || 's').toLowerCase()];
  if (seconds <= 0) throw new Error(`Duration must be positive: "${input}"`);
  return seconds;
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  heic: 'image/heic', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', zip: 'application/zip', gz: 'application/gzip',
  tar: 'application/x-tar', '7z': 'application/x-7z-compressed',
  json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown',
  csv: 'text/csv', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', webm: 'video/webm',
  mov: 'video/quicktime', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function mimeFromFilename(filename: string): string {
  const ext = extname(filename).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/** Short extension for a MIME type, for naming clipboard images */
export function extFromMime(mime: string): string {
  const sub = mime.split('/')[1] || 'bin';
  return sub === 'jpeg' ? 'jpg' : sub === 'svg+xml' ? 'svg' : sub;
}

/** `path`, or `name-1.ext`, `name-2.ext`, ... — the first one that doesn't exist */
export function uniquePath(path: string, exists: (p: string) => boolean = existsSync): string {
  if (!exists(path)) return path;
  const ext = extname(path);
  const stem = basename(path, ext);
  const dir = dirname(path);
  for (let i = 1; ; i++) {
    const candidate = join(dir, `${stem}-${i}${ext}`);
    if (!exists(candidate)) return candidate;
  }
}

/** Strip directory parts from a server-provided filename so it can't escape cwd */
export function safeFilename(name: string | null | undefined, fallback: string): string {
  const base = (name || '').split(/[\\/]/).pop()?.replace(/^\.+/, '').trim();
  return base || fallback;
}

export type CatchUpDecision = 'apply' | 'record' | 'skip';

/**
 * Daemon catch-up after (re)connecting.
 * - No state yet (first ever run) → only record, never clobber the local clipboard.
 * - Newer than the last remote clip we saw → apply.
 */
export function catchUpDecision(lastSeenAt: string | null, clipCreatedAt: string): CatchUpDecision {
  if (lastSeenAt === null) return 'record';
  return clipCreatedAt > lastSeenAt ? 'apply' : 'skip';
}

/** Whether the watch daemon should put a remote clip on this device's clipboard */
export function shouldApplyRemote(clip: ClipResponse, selfId: string, syncImages: boolean): string | null {
  if (clip.device_id === selfId) return 'own clip';
  if (clip.target_device_id && clip.target_device_id !== selfId) return 'targeted at another device';
  if (clip.burn_after_read) return 'one-time clip';
  if (clip.type === 'file') return 'file clip';
  if (clip.type === 'image' && !syncImages) return 'image sync disabled';
  return null;
}

export function localPlatform(): DevicePlatform {
  const os = platform();
  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';
  return 'linux';
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diff / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
