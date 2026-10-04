import type {
  ClipResponse,
  ClipListResponse,
  DeviceListResponse,
  DevicePlatform,
  DeviceResponse,
  PushOptions,
} from '@lan-paste/shared';

export interface Identity {
  deviceId: string;
  deviceName: string;
  platform?: DevicePlatform;
}

export interface ListQuery {
  limit?: number;
  offset?: number;
  type?: string;
  q?: string;
  pinned?: boolean;
}

export class ApiClient {
  private baseUrl: string;

  constructor(
    baseUrl: string,
    private apiKey?: string,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  private url(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path}`;
  }

  private async request(path: string, init: RequestInit, action: string): Promise<Response> {
    const res = await fetch(this.url(path), {
      ...init,
      headers: { ...this.authHeaders(), ...(init.headers as Record<string, string> | undefined) },
    });
    if (!res.ok && res.status !== 204) {
      let detail = await res.text();
      try {
        const parsed = JSON.parse(detail);
        if (parsed?.error) detail = parsed.error;
      } catch {
        // not JSON
      }
      throw new Error(`${action} failed (${res.status}): ${detail}`);
    }
    return res;
  }

  async pushText(content: string, who: Identity, opts: PushOptions = {}): Promise<ClipResponse> {
    const res = await this.request('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        content,
        device_id: who.deviceId,
        device_name: who.deviceName,
        platform: who.platform,
        ...opts,
      }),
    }, 'Push');
    return res.json() as Promise<ClipResponse>;
  }

  /** Push an image or any file (multipart). The server decides image vs file from the MIME type. */
  async pushFile(data: Buffer, filename: string, mimeType: string, who: Identity, opts: PushOptions = {}): Promise<ClipResponse> {
    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(data)], { type: mimeType }), filename);
    formData.append('device_id', who.deviceId);
    formData.append('device_name', who.deviceName);
    if (who.platform) formData.append('platform', who.platform);
    if (opts.expires_in) formData.append('expires_in', String(opts.expires_in));
    if (opts.burn_after_read) formData.append('burn_after_read', 'true');
    if (opts.encrypted) formData.append('encrypted', 'true');
    if (opts.target_device_id) formData.append('target_device_id', opts.target_device_id);

    const res = await this.request('/api/clips', { method: 'POST', body: formData }, 'Push');
    return res.json() as Promise<ClipResponse>;
  }

  async latest(selfDeviceId?: string): Promise<ClipResponse | null> {
    const params = selfDeviceId ? `?${new URLSearchParams({ device_id: selfDeviceId })}` : '';
    const res = await this.request(`/api/clips/latest${params}`, {}, 'Pull');
    if (res.status === 204) return null;
    return res.json() as Promise<ClipResponse>;
  }

  async get(id: string): Promise<ClipResponse> {
    const res = await this.request(`/api/clips/${encodeURIComponent(id)}`, {}, 'Get');
    return res.json() as Promise<ClipResponse>;
  }

  /** Return a one-time text clip's content; the server deletes it */
  async reveal(id: string): Promise<ClipResponse> {
    const res = await this.request(`/api/clips/${encodeURIComponent(id)}/reveal`, { method: 'POST' }, 'Reveal');
    return res.json() as Promise<ClipResponse>;
  }

  async setPinned(id: string, pinned: boolean): Promise<ClipResponse> {
    const res = await this.request(`/api/clips/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    }, pinned ? 'Pin' : 'Unpin');
    return res.json() as Promise<ClipResponse>;
  }

  async delete(id: string): Promise<void> {
    await this.request(`/api/clips/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'Delete');
  }

  async devices(): Promise<DeviceResponse[]> {
    const res = await this.request('/api/devices', {}, 'Devices');
    return ((await res.json()) as DeviceListResponse).devices;
  }

  /** WebSocket URL; API key goes in the query since WS can't send headers */
  wsUrl(): string {
    const url = new URL('/ws', this.baseUrl.replace(/^http/, 'ws'));
    if (this.apiKey) url.searchParams.set('api_key', this.apiKey);
    return url.toString();
  }

  /** Download an image_url / file_url (relative or absolute) */
  async fetchBlob(blobUrl: string): Promise<Buffer> {
    const res = await this.request(blobUrl, {}, 'Download');
    return Buffer.from(await res.arrayBuffer());
  }

  async list(query: ListQuery = {}): Promise<ClipListResponse> {
    const params = new URLSearchParams({ limit: String(query.limit ?? 50), offset: String(query.offset ?? 0) });
    if (query.type) params.set('type', query.type);
    if (query.q) params.set('q', query.q);
    if (query.pinned) params.set('pinned', 'true');
    const res = await this.request(`/api/clips?${params}`, {}, 'List');
    return res.json() as Promise<ClipListResponse>;
  }
}

/** Resolve `--to` (device id or case-insensitive name) to a device id */
export function resolveDevice(devices: DeviceResponse[], query: string): DeviceResponse {
  const byId = devices.find((d) => d.id === query);
  if (byId) return byId;
  const lower = query.toLowerCase();
  const byName = devices.filter((d) => d.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(`Device name "${query}" is ambiguous: ${byName.map((d) => d.id).join(', ')} — use the id`);
  }
  const known = devices.map((d) => d.name).join(', ') || '(none)';
  throw new Error(`Unknown device "${query}". Known devices: ${known}`);
}
