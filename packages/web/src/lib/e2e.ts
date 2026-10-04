import { useSyncExternalStore } from 'react';
import { deriveKey } from '@lan-paste/shared/crypto';
import type { E2EKey } from '@lan-paste/shared/crypto';
import { storageGet, storageSet } from './storage.js';

const PASSPHRASE_KEY = 'lan-paste-e2e-passphrase';
const ENCRYPT_KEY = 'lan-paste-e2e-encrypt';

export interface E2EState {
  passphrase: string;
  /** Encrypt this device's pushes */
  encrypt: boolean;
  /** Derived key, null while deriving or when no passphrase */
  key: E2EKey | null;
  deriving: boolean;
}

let state: E2EState = {
  passphrase: storageGet(PASSPHRASE_KEY) || '',
  encrypt: storageGet(ENCRYPT_KEY) === '1',
  key: null,
  deriving: false,
};
let keyPromise: Promise<E2EKey | null> = Promise.resolve(null);
const listeners = new Set<() => void>();

function emit(next: Partial<E2EState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function derive(): void {
  const passphrase = state.passphrase;
  if (!passphrase) {
    emit({ key: null, deriving: false });
    keyPromise = Promise.resolve(null);
    return;
  }
  emit({ key: null, deriving: true });
  // PBKDF2 (210k rounds, pure JS) blocks for a moment — yield first so "deriving…" can paint
  keyPromise = new Promise((resolve) => {
    setTimeout(() => {
      const key = deriveKey(passphrase);
      if (state.passphrase === passphrase) emit({ key, deriving: false });
      resolve(key);
    }, 50);
  });
}

derive();

export function setE2ESettings(next: { passphrase: string; encrypt: boolean }): void {
  const changed = next.passphrase !== state.passphrase;
  storageSet(PASSPHRASE_KEY, next.passphrase || null);
  storageSet(ENCRYPT_KEY, next.encrypt ? '1' : null);
  emit({ passphrase: next.passphrase, encrypt: next.encrypt && !!next.passphrase });
  if (changed) derive();
}

/** Key to encrypt pushes with, or null when encryption is off. Throws if on but unusable. */
export async function getPushKey(): Promise<E2EKey | null> {
  if (!state.encrypt) return null;
  const key = await keyPromise;
  if (!key) throw new Error('Encryption is on but no passphrase is set');
  return key;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useE2E(): E2EState {
  return useSyncExternalStore(subscribe, () => state);
}
