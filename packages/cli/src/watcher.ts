import { spawn, execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { hashContent } from '@lan-paste/shared';
import type { WsNewClip, ClipResponse } from '@lan-paste/shared';
import { ApiClient } from './client.js';
import {
  readClipboardText,
  readClipboardImage,
  writeClipboardText,
  writeClipboardImage,
  clipboardMimeTypes,
} from './clipboard/index.js';

interface WatcherOptions {
  serverUrl: string;
  apiKey?: string;
  deviceId: string;
  deviceName: string;
  pushEnabled: boolean;
  pullEnabled: boolean;
  syncImages: boolean;
  verbose: boolean;
}

const PULL_COOLDOWN_MS = 2000;

export class ClipboardWatcher {
  private client: ApiClient;
  private ws: WebSocket | null = null;
  private lastPushedHash = '';
  private lastPullTimestamp = 0;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private opts: WatcherOptions) {
    this.client = new ApiClient(opts.serverUrl, opts.apiKey);
  }

  start(): void {
    this.running = true;
    this.log('Starting clipboard watcher...');
    this.log(`  Server: ${this.opts.serverUrl}`);
    this.log(`  Device: ${this.opts.deviceName} (${this.opts.deviceId})`);
    this.log(`  Push: ${this.opts.pushEnabled}, Pull: ${this.opts.pullEnabled}, Images: ${this.opts.syncImages}`);

    if (this.opts.pullEnabled) {
      this.connectWebSocket();
    }

    if (this.opts.pushEnabled) {
      this.startClipboardWatch();
    }

    // Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop(): void {
    this.running = false;
    this.log('Stopping...');
    this.ws?.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    process.exit(0);
  }

  private log(msg: string): void {
    const ts = new Date().toLocaleTimeString();
    console.log(`[${ts}] ${msg}`);
  }

  private debug(msg: string): void {
    if (this.opts.verbose) this.log(msg);
  }

  // ── Push direction: local clipboard → server ──

  private startClipboardWatch(): void {
    const os = platform();

    if (os === 'linux' && process.env.WAYLAND_DISPLAY) {
      this.watchWayland();
    } else if (os === 'linux') {
      this.watchPolling();
    } else {
      this.watchPolling();
    }
  }

  private watchWayland(): void {
    this.log('Watching clipboard via wl-paste --watch');

    // wl-paste --watch outputs to stdout every time clipboard changes
    // We use a sentinel command that just echoes, then we read the actual clipboard
    const proc = spawn('wl-paste', ['--watch', 'sh', '-c', 'echo CHANGED'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    proc.stdout.on('data', () => {
      // Debounce: clipboard can fire multiple events rapidly
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => this.onClipboardChanged(), 150);
    });

    proc.stderr.on('data', (data) => {
      this.debug(`wl-paste stderr: ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
      if (this.running) {
        this.log(`wl-paste --watch exited (code ${code}), restarting in 2s...`);
        setTimeout(() => this.watchWayland(), 2000);
      }
    });

    proc.on('error', (err) => {
      this.log(`wl-paste error: ${err.message}`);
    });
  }

  private watchPolling(): void {
    this.log('Watching clipboard via polling (1s interval)');
    setInterval(() => this.onClipboardChanged(), 1000);
  }

  private async onClipboardChanged(): Promise<void> {
    // Skip if we just pulled from server (prevents loops)
    if (Date.now() - this.lastPullTimestamp < PULL_COOLDOWN_MS) {
      this.debug('Skipping push: within pull cooldown');
      return;
    }

    try {
      // Check what's on the clipboard
      const types = clipboardMimeTypes();
      const hasImage = types.some((t) => t.startsWith('image/'));
      const hasText = types.includes('text/plain') || types.includes('TEXT') || types.includes('UTF8_STRING');

      if (hasImage && this.opts.syncImages) {
        await this.pushClipboardImage();
      } else if (hasText) {
        await this.pushClipboardText();
      }
    } catch (err) {
      this.debug(`Clipboard read error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async pushClipboardText(): Promise<void> {
    const text = readClipboardText();
    if (!text.trim()) return;

    const hash = hashContent(text);
    if (hash === this.lastPushedHash) {
      return; // dedup
    }

    try {
      const clip = await this.client.pushText(text, this.opts.deviceId, this.opts.deviceName);
      this.lastPushedHash = hash;
      this.log(`Pushed text (${clip.size_bytes}B) → ${clip.id}`);
    } catch (err) {
      this.debug(`Push text failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async pushClipboardImage(): Promise<void> {
    try {
      const { data, mimeType } = readClipboardImage();
      const hash = hashContent(data);
      if (hash === this.lastPushedHash) return;

      const ext = mimeType.split('/')[1] || 'png';
      const clip = await this.client.pushImage(
        data, `clipboard.${ext}`, mimeType,
        this.opts.deviceId, this.opts.deviceName,
      );
      this.lastPushedHash = hash;
      this.log(`Pushed image (${clip.size_bytes}B, ${mimeType}) → ${clip.id}`);
    } catch (err) {
      this.debug(`Push image failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ── Pull direction: server → local clipboard ──

  private connectWebSocket(): void {
    const wsUrl = this.opts.serverUrl.replace(/^http/, 'ws') + '/ws';
    this.log(`Connecting to ${wsUrl}`);

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.log('WebSocket connected');
      ws.send(JSON.stringify({
        type: 'identify',
        device_id: this.opts.deviceId,
        device_name: this.opts.deviceName,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'new_clip') {
          this.onRemoteClip(msg.clip as ClipResponse);
        }
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      if (!this.running) return;
      this.log(`WebSocket disconnected, reconnecting in ${this.reconnectDelay / 1000}s...`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
        this.connectWebSocket();
      }, this.reconnectDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private async onRemoteClip(clip: ClipResponse): Promise<void> {
    try {
      if (clip.type === 'text' && clip.content) {
        writeClipboardText(clip.content);
        this.lastPullTimestamp = Date.now();
        this.lastPushedHash = hashContent(clip.content);
        this.log(`Pulled text from ${clip.device_name} (${clip.size_bytes}B) → clipboard`);
      } else if (clip.type === 'image' && clip.image_url && this.opts.syncImages) {
        const imageData = await this.client.fetchImage(clip.image_url);
        writeClipboardImage(imageData, clip.mime_type);
        this.lastPullTimestamp = Date.now();
        this.lastPushedHash = hashContent(imageData);
        this.log(`Pulled image from ${clip.device_name} (${imageData.length}B) → clipboard`);
      }
    } catch (err) {
      this.debug(`Pull to clipboard failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
