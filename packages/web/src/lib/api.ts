import type {
  ClipResponse,
  ClipListResponse,
  ClipType,
  DeviceListResponse,
  PushOptions,
} from '@lan-paste/shared';
import { getDeviceId, getDeviceName, getPlatform } from './device.js';
import { storageGet, storageSet } from './storage.js';

const BASE = '';
const API_KEY_KEY = 'lan-paste-api-key';

export function getApiKey(): string {
  return storageGet(API_KEY_KEY) || '';
}

export function setApiKey(key: string): void {
  storageSet(API_KEY_KEY, key.trim() || null);
}

/** Append the API key as a query param — for <img src>, downloads and WebSocket URLs */
export function withApiKey(url: string): string {
  const key = getApiKey();
  if (!key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
}

async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const key = getApiKey();
  if (key) headers.set('Authorization', `Bearer ${key}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    const entered = window.prompt('LAN Paste server requires an API key:');
    if (entered) {
      setApiKey(entered);
      return apiFetch(path, init, false);
    }
  }
  return res;
}

async function errorMessage(res: Response, prefix: string): Promise<string> {
  try {
    const body = await res.json();
    if (body?.error) return `${prefix}: ${body.error}`;
  } catch {
    // non-JSON body
  }
  return `${prefix}: ${res.status}`;
}

export async function pushText(content: string, opts: PushOptions = {}): Promise<ClipResponse> {
  const res = await apiFetch('/api/clips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'text',
      content,
      device_id: getDeviceId(),
      device_name: getDeviceName(),
      platform: getPlatform(),
      ...opts,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Push failed'));
  return res.json();
}

export async function pushFile(file: File, opts: PushOptions = {}): Promise<ClipResponse> {
  const formData = new FormData();
  formData.append('device_id', getDeviceId());
  formData.append('device_name', getDeviceName());
  formData.append('platform', getPlatform());
  for (const [k, v] of Object.entries(opts)) {
    if (v !== undefined && v !== false) formData.append(k, String(v));
  }
  // File last: multer may see fields after the file otherwise
  formData.append('file', file, file.name);

  const res = await apiFetch('/api/clips', { method: 'POST', body: formData });
  if (!res.ok) throw new Error(await errorMessage(res, 'Push failed'));
  return res.json();
}

export interface ClipQuery {
  limit?: number;
  offset?: number;
  before?: string;
  type?: ClipType;
  q?: string;
  pinned?: boolean;
}

export async function fetchClips(query: ClipQuery = {}): Promise<ClipListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '' && v !== false) params.set(k, String(v));
  }
  const res = await apiFetch(`/api/clips?${params}`);
  if (!res.ok) throw new Error(await errorMessage(res, 'Fetch failed'));
  return res.json();
}

export async function patchClip(id: string, body: { pinned?: boolean }): Promise<ClipResponse> {
  const res = await apiFetch(`/api/clips/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessage(res, 'Update failed'));
  return res.json();
}

/** One-time text clip: returns its content and the server deletes it */
export async function revealClip(id: string): Promise<ClipResponse> {
  const res = await apiFetch(`/api/clips/${encodeURIComponent(id)}/reveal`, { method: 'POST' });
  if (!res.ok) throw new Error(await errorMessage(res, 'Reveal failed'));
  return res.json();
}

/** Fetch a clip's binary (file_url / image_url) with auth */
export async function fetchBlob(url: string): Promise<Blob> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(await errorMessage(res, 'Download failed'));
  return res.blob();
}

export async function deleteClip(id: string): Promise<void> {
  const res = await apiFetch(`/api/clips/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(await errorMessage(res, 'Delete failed'));
}

export async function fetchDevices(): Promise<DeviceListResponse> {
  const res = await apiFetch('/api/devices');
  if (!res.ok) throw new Error(await errorMessage(res, 'Fetch devices failed'));
  return res.json();
}
