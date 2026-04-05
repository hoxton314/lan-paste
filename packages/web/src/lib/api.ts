import type { ClipResponse, ClipListResponse } from '@lan-paste/shared';
import { getDeviceId, getDeviceName } from './device.js';

const BASE = '';

export async function pushText(content: string): Promise<ClipResponse> {
  const res = await fetch(`${BASE}/api/clips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'text',
      content,
      device_id: getDeviceId(),
      device_name: getDeviceName(),
    }),
  });
  if (!res.ok) throw new Error(`Push failed: ${res.status}`);
  return res.json();
}

export async function fetchClips(limit = 50, offset = 0): Promise<ClipListResponse> {
  const res = await fetch(`${BASE}/api/clips?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json();
}

export async function pushImage(file: File): Promise<ClipResponse> {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('device_id', getDeviceId());
  formData.append('device_name', getDeviceName());

  const res = await fetch(`${BASE}/api/clips`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Push failed: ${res.status}`);
  return res.json();
}

export async function deleteClip(id: string): Promise<void> {
  const res = await fetch(`${BASE}/api/clips/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed: ${res.status}`);
}
