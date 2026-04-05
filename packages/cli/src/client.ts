import type { ClipResponse, ClipListResponse } from '@lan-paste/shared';

export class ApiClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  async push(content: string, deviceId: string, deviceName: string): Promise<ClipResponse> {
    const res = await fetch(`${this.baseUrl}/api/clips`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'text', content, device_id: deviceId, device_name: deviceName }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Push failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipResponse>;
  }

  async latest(excludeDeviceId?: string): Promise<ClipResponse | null> {
    const params = excludeDeviceId ? `?device_id=${excludeDeviceId}` : '';
    const res = await fetch(`${this.baseUrl}/api/clips/latest${params}`, {
      headers: this.headers(),
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Pull failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipResponse>;
  }

  async list(limit = 50, offset = 0, type?: string): Promise<ClipListResponse> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (type) params.set('type', type);
    const res = await fetch(`${this.baseUrl}/api/clips?${params}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`List failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<ClipListResponse>;
  }
}
