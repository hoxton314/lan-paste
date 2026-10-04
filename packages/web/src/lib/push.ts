import type { ClipResponse, PushOptions } from '@lan-paste/shared';
import { encryptBytes, encryptText } from '@lan-paste/shared/crypto';
import { pushFile, pushText } from './api.js';
import { getPushKey } from './e2e.js';

export type PushOpts = Omit<PushOptions, 'encrypted'>;

/** Push text, encrypting it first when E2E is enabled */
export async function pushTextClip(text: string, opts: PushOpts = {}): Promise<ClipResponse> {
  const key = await getPushKey();
  if (!key) return pushText(text, opts);
  return pushText(encryptText(text, key), { ...opts, encrypted: true });
}

/** Push an image or any file, encrypting its bytes first when E2E is enabled */
export async function pushFileClip(file: File, opts: PushOpts = {}): Promise<ClipResponse> {
  const key = await getPushKey();
  if (!key) return pushFile(file, opts);
  const plain = new Uint8Array(await file.arrayBuffer());
  const sealed = encryptBytes(plain, key);
  // Keep the original name + mime so receivers can restore the file after decrypting
  const encFile = new File([sealed as Uint8Array<ArrayBuffer>], file.name, {
    type: file.type || 'application/octet-stream',
  });
  return pushFile(encFile, { ...opts, encrypted: true });
}

/** Name pasted/shared blobs that arrive without one */
export function ensureNamed(file: File): File {
  if (file.name && file.name !== 'image.png' && file.name !== 'blob') return file;
  const ext = file.type.split('/')[1]?.split('+')[0] || 'bin';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new File([file], `clipboard-${stamp}.${ext}`, { type: file.type });
}
