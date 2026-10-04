/**
 * End-to-end encryption shared by the web UI and CLI.
 *
 * Pure JS (@noble) on purpose: WebCrypto's `crypto.subtle` is unavailable in
 * non-secure contexts, and the web UI is commonly served over plain HTTP on a LAN.
 *
 * Envelope (binary):  "LP1" | key_id (4 bytes) | iv (12 bytes) | AES-256-GCM ciphertext+tag
 * Text clips store the envelope base64-encoded in `content`.
 */
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const MAGIC = utf8ToBytes('LP1');
const KEY_ID_LEN = 4;
const IV_LEN = 12;
const HEADER_LEN = MAGIC.length + KEY_ID_LEN + IV_LEN;

// Fixed salt: every device must derive the same key from the same passphrase
// without any coordination. The passphrase is the only secret.
const SALT = utf8ToBytes('lan-paste/e2e/v1');
const ITERATIONS = 210_000;

export interface E2EKey {
  key: Uint8Array;
  /** First bytes of sha256(key) — lets clients detect "wrong passphrase" without trial decryption */
  id: Uint8Array;
}

export class DecryptError extends Error {
  constructor(
    message: string,
    public readonly reason: 'format' | 'wrong_key' | 'corrupt',
  ) {
    super(message);
    this.name = 'DecryptError';
  }
}

export function deriveKey(passphrase: string): E2EKey {
  const key = pbkdf2(sha256, utf8ToBytes(passphrase.normalize('NFC')), SALT, { c: ITERATIONS, dkLen: 32 });
  return { key, id: sha256(key).slice(0, KEY_ID_LEN) };
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function isEncryptedEnvelope(data: Uint8Array): boolean {
  return data.length > HEADER_LEN && equal(data.subarray(0, MAGIC.length), MAGIC);
}

export function encryptBytes(plain: Uint8Array, k: E2EKey): Uint8Array {
  const iv = randomBytes(IV_LEN);
  const ct = gcm(k.key, iv).encrypt(plain);
  const out = new Uint8Array(HEADER_LEN + ct.length);
  out.set(MAGIC, 0);
  out.set(k.id, MAGIC.length);
  out.set(iv, MAGIC.length + KEY_ID_LEN);
  out.set(ct, HEADER_LEN);
  return out;
}

export function decryptBytes(envelope: Uint8Array, k: E2EKey): Uint8Array {
  if (!isEncryptedEnvelope(envelope)) throw new DecryptError('Not an encrypted clip', 'format');
  const keyId = envelope.subarray(MAGIC.length, MAGIC.length + KEY_ID_LEN);
  if (!equal(keyId, k.id)) throw new DecryptError('Encrypted with a different passphrase', 'wrong_key');
  const iv = envelope.subarray(MAGIC.length + KEY_ID_LEN, HEADER_LEN);
  try {
    return gcm(k.key, iv).decrypt(envelope.subarray(HEADER_LEN));
  } catch {
    throw new DecryptError('Ciphertext is corrupt', 'corrupt');
  }
}

// base64 without Buffer (browser) or btoa limits on large inputs
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[n >> 18] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]) << 18) |
      (B64.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0);
    out[o++] = n >> 16;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

export function encryptText(plain: string, k: E2EKey): string {
  return bytesToBase64(encryptBytes(utf8ToBytes(plain), k));
}

export function decryptText(content: string, k: E2EKey): string {
  return new TextDecoder().decode(decryptBytes(base64ToBytes(content), k));
}
