import { describe, expect, it } from 'vitest';
import type { ClipResponse } from '@lan-paste/shared';
import {
  catchUpDecision,
  extFromMime,
  mimeFromFilename,
  parseDuration,
  safeFilename,
  shouldApplyRemote,
  uniquePath,
} from './util.js';
import { resolveDevice } from '../client.js';

describe('parseDuration', () => {
  it.each([
    ['30s', 30], ['10m', 600], ['2h', 7200], ['1d', 86400], ['1w', 604800], ['45', 45], [' 5M ', 300],
  ])('%s → %i', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', 'abc', '10x', '-5m', '1.5h', '0s'])('rejects %j', (input) => {
    expect(() => parseDuration(input)).toThrow();
  });
});

describe('mime helpers', () => {
  it('maps known extensions case-insensitively', () => {
    expect(mimeFromFilename('shot.PNG')).toBe('image/png');
    expect(mimeFromFilename('a.jpeg')).toBe('image/jpeg');
    expect(mimeFromFilename('doc.pdf')).toBe('application/pdf');
  });

  it('falls back to octet-stream', () => {
    expect(mimeFromFilename('blob.xyz')).toBe('application/octet-stream');
    expect(mimeFromFilename('Makefile')).toBe('application/octet-stream');
  });

  it('extFromMime', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg');
    expect(extFromMime('image/svg+xml')).toBe('svg');
    expect(extFromMime('image/png')).toBe('png');
  });
});

describe('uniquePath', () => {
  it('returns the path when free', () => {
    expect(uniquePath('/x/a.txt', () => false)).toBe('/x/a.txt');
  });

  it('adds -1, -2 suffixes before the extension', () => {
    const taken = new Set(['/x/a.txt', '/x/a-1.txt']);
    expect(uniquePath('/x/a.txt', (p) => taken.has(p))).toBe('/x/a-2.txt');
  });

  it('handles names without extension', () => {
    expect(uniquePath('/x/README', (p) => p === '/x/README')).toBe('/x/README-1');
  });
});

describe('safeFilename', () => {
  it('strips directories and leading dots', () => {
    expect(safeFilename('../../etc/passwd', 'f')).toBe('passwd');
    expect(safeFilename('C:\\Users\\x\\evil.exe', 'f')).toBe('evil.exe');
    expect(safeFilename('..', 'fallback')).toBe('fallback');
    expect(safeFilename(null, 'fallback')).toBe('fallback');
  });
});

describe('catchUpDecision', () => {
  it('records without applying on first ever run', () => {
    expect(catchUpDecision(null, '2026-01-01T00:00:00.000Z')).toBe('record');
  });

  it('applies clips newer than last seen', () => {
    expect(catchUpDecision('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z')).toBe('apply');
  });

  it('skips clips already seen', () => {
    expect(catchUpDecision('2026-01-01T00:00:01.000Z', '2026-01-01T00:00:01.000Z')).toBe('skip');
    expect(catchUpDecision('2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe('skip');
  });
});

describe('shouldApplyRemote', () => {
  const base = {
    id: 'c1', type: 'text', content: 'hi', device_id: 'other', target_device_id: null,
    burn_after_read: false, encrypted: false,
  } as unknown as ClipResponse;

  it('applies ordinary clips from other devices', () => {
    expect(shouldApplyRemote(base, 'me', true)).toBeNull();
    expect(shouldApplyRemote({ ...base, target_device_id: 'me' }, 'me', true)).toBeNull();
  });

  it('ignores own, targeted-elsewhere, one-time and file clips', () => {
    expect(shouldApplyRemote({ ...base, device_id: 'me' }, 'me', true)).toMatch(/own/);
    expect(shouldApplyRemote({ ...base, target_device_id: 'x' }, 'me', true)).toMatch(/another/);
    expect(shouldApplyRemote({ ...base, burn_after_read: true }, 'me', true)).toMatch(/one-time/);
    expect(shouldApplyRemote({ ...base, type: 'file' }, 'me', true)).toMatch(/file/);
    expect(shouldApplyRemote({ ...base, type: 'image' }, 'me', false)).toMatch(/image/);
  });
});

describe('resolveDevice', () => {
  const devices = [
    { id: 'aaa', name: 'Laptop' },
    { id: 'bbb', name: 'Phone' },
    { id: 'ccc', name: 'phone' },
  ] as never[];

  it('matches id exactly', () => {
    expect(resolveDevice(devices, 'bbb').id).toBe('bbb');
  });

  it('matches names case-insensitively', () => {
    expect(resolveDevice(devices, 'laptop').id).toBe('aaa');
  });

  it('errors on ambiguous or unknown names', () => {
    expect(() => resolveDevice(devices, 'PHONE')).toThrow(/ambiguous/);
    expect(() => resolveDevice(devices, 'tv')).toThrow(/Unknown device/);
  });
});
