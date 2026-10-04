import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  decryptText,
  DecryptError,
  deriveKey,
  encryptBytes,
  encryptText,
  isEncryptedEnvelope,
} from './crypto.js';

const key = deriveKey('correct horse battery staple');

describe('crypto', () => {
  it('derives the same key on every device', () => {
    expect(deriveKey('correct horse battery staple').id).toEqual(key.id);
  });

  it('round-trips text, including unicode', () => {
    const msg = 'zażółć gęślą jaźń 🚀\nline 2';
    const ct = encryptText(msg, key);
    expect(ct).not.toContain('zażółć');
    expect(decryptText(ct, key)).toBe(msg);
  });

  it('round-trips binary', () => {
    const data = new Uint8Array(10_000).map((_, i) => i % 256);
    const env = encryptBytes(data, key);
    expect(isEncryptedEnvelope(env)).toBe(true);
    expect(decryptBytes(env, key)).toEqual(data);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptText('same', key)).not.toBe(encryptText('same', key));
  });

  it('reports a wrong passphrase distinctly', () => {
    const ct = encryptText('secret', key);
    try {
      decryptText(ct, deriveKey('other'));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(DecryptError);
      expect((err as DecryptError).reason).toBe('wrong_key');
    }
  });

  it('detects tampering', () => {
    const env = encryptBytes(new Uint8Array([1, 2, 3]), key);
    env[env.length - 1] ^= 1;
    expect(() => decryptBytes(env, key)).toThrow(/corrupt/);
  });

  it('base64 matches Buffer for all tail lengths', () => {
    for (let n = 0; n < 8; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 97 + 13) % 256);
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(base64ToBytes(b64)).toEqual(bytes);
    }
  });
});
