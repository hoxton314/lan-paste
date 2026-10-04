import { deriveKey, decryptBytes, decryptText, encryptBytes, encryptText, DecryptError } from '@lan-paste/shared/crypto';
import type { E2EKey } from '@lan-paste/shared/crypto';
import type { LanPasteConfig } from '@lan-paste/shared';

let cached: { passphrase: string; key: E2EKey } | null = null;

/** Derive (once — PBKDF2 is deliberately slow) the E2E key, or null if no passphrase configured */
export function getKey(config: LanPasteConfig): E2EKey | null {
  const passphrase = config.encryption.passphrase;
  if (!passphrase) return null;
  if (cached?.passphrase !== passphrase) cached = { passphrase, key: deriveKey(passphrase) };
  return cached.key;
}

/** Key required for pushing encrypted; throws a user-facing error if not configured */
export function requireKey(config: LanPasteConfig): E2EKey {
  const key = getKey(config);
  if (!key) {
    throw new Error('Encryption requested but no passphrase set (lan-paste config set encryption.passphrase <passphrase>)');
  }
  return key;
}

export function describeDecryptError(err: unknown): string {
  if (err instanceof DecryptError) {
    if (err.reason === 'wrong_key') return 'clip was encrypted with a different passphrase';
    if (err.reason === 'corrupt') return 'encrypted clip is corrupt';
    return 'clip is not in the expected encrypted format';
  }
  return err instanceof Error ? err.message : String(err);
}

function keyOrThrow(config: LanPasteConfig): E2EKey {
  const key = getKey(config);
  if (!key) throw new Error('Clip is end-to-end encrypted but no passphrase is configured (encryption.passphrase)');
  return key;
}

export function decryptClipText(content: string, config: LanPasteConfig): string {
  const key = keyOrThrow(config);
  try {
    return decryptText(content, key);
  } catch (err) {
    throw new Error(`Cannot decrypt: ${describeDecryptError(err)}`);
  }
}

export function decryptClipBytes(data: Buffer, config: LanPasteConfig): Buffer {
  const key = keyOrThrow(config);
  try {
    return Buffer.from(decryptBytes(new Uint8Array(data), key));
  } catch (err) {
    throw new Error(`Cannot decrypt: ${describeDecryptError(err)}`);
  }
}

export function encryptClipText(text: string, key: E2EKey): string {
  return encryptText(text, key);
}

export function encryptClipBytes(data: Buffer, key: E2EKey): Buffer {
  return Buffer.from(encryptBytes(new Uint8Array(data), key));
}
