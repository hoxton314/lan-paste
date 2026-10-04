import type { DevicePlatform } from '@lan-paste/shared';
import { storageGet, storageSet } from './storage.js';

const DEVICE_ID_KEY = 'lan-paste-device-id';
const DEVICE_NAME_KEY = 'lan-paste-device-name';

let memoryId: string | null = null;

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as "Macintosh" — detect via touch support
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function guessDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Web';
}

export function getPlatform(): DevicePlatform {
  if (isIos()) return 'ios';
  if (/Android/.test(navigator.userAgent)) return 'android';
  return 'web';
}

export function getDeviceId(): string {
  let id = storageGet(DEVICE_ID_KEY) ?? memoryId;
  if (!id) {
    id = generateId();
    memoryId = id;
    storageSet(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  let name = storageGet(DEVICE_NAME_KEY);
  if (!name) {
    name = guessDeviceName();
    storageSet(DEVICE_NAME_KEY, name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  storageSet(DEVICE_NAME_KEY, name.trim() || guessDeviceName());
}
