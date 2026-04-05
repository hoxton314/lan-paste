import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { ClipResponse, ClipListResponse } from '@lan-paste/shared';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async pushText(content: string, deviceId: string, deviceName: string): Promise<ClipResponse> {
    const res = await fetch(`${this.baseUrl}/api/clips`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'text', content, device_id: deviceId, device_name: deviceName }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Push failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipResponse>;
  }

  async pushImage(imageBuffer: Buffer, filename: string, mimeType: string, deviceId: string, deviceName: string): Promise<ClipResponse> {
    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: mimeType }), filename);
    formData.append('device_id', deviceId);
    formData.append('device_name', deviceName);

    const res = await fetch(`${this.baseUrl}/api/clips`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: formData,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Push failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipResponse>;
  }

  async pushImageFile(filepath: string, deviceId: string, deviceName: string): Promise<ClipResponse> {
    const buffer = readFileSync(filepath);
    const name = basename(filepath);
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    };
    const mime = mimeMap[ext] || 'image/png';
    return this.pushImage(buffer, name, mime, deviceId, deviceName);
  }

  async latest(excludeDeviceId?: string): Promise<ClipResponse | null> {
    const params = excludeDeviceId ? `?device_id=${excludeDeviceId}` : '';
    const res = await fetch(`${this.baseUrl}/api/clips/latest${params}`, {
      headers: this.authHeaders(),
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Pull failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipResponse>;
  }

  async fetchImage(imageUrl: string): Promise<Buffer> {
    const url = imageUrl.startsWith('http') ? imageUrl : `${this.baseUrl}${imageUrl}`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async list(limit = 50, offset = 0, type?: string): Promise<ClipListResponse> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (type) params.set('type', type);
    const res = await fetch(`${this.baseUrl}/api/clips?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`List failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipListResponse>;
  }
}
