import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from './env.js';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function getStorageDir(): string {
  const dir = resolve(env.LAN_PASTE_STORAGE_DIR);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getImageDir(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const dir = join(getStorageDir(), 'images', year, month);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getExtForMime(mime: string): string {
  return MIME_TO_EXT[mime] || '.bin';
}

export function resolveImagePath(filepath: string): string {
  return join(getStorageDir(), filepath);
}

export function deleteImageFile(filepath: string): void {
  const fullPath = resolveImagePath(filepath);
  try {
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch {
    // best-effort cleanup
  }
}
