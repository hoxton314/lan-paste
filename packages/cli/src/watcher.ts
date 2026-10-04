import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { hashContent } from '@lan-paste/shared';
import type { ClipResponse, LanPasteConfig } from '@lan-paste/shared';
import type { E2EKey } from '@lan-paste/shared/crypto';
import { ApiClient } from './client.js';
import type { Identity } from './client.js';
import {
  readClipboardText,
  readClipboardImage,
  writeClipboardText,
  writeClipboardImage,
  clipboardMimeTypes,
} from './clipboard/index.js';
import { decryptClipBytes, decryptClipText, encryptClipBytes, encryptClipText } from './lib/e2e.js';
import { loadState, saveState } from './lib/state.js';
import { catchUpDecision, errMsg, extFromMime, localPlatform, shouldApplyRemote } from './lib/util.js';

interface WatcherOptions {
  config: LanPasteConfig;
  serverUrl: string;
  apiKey?: string;
  deviceId: string;
  deviceName: string;
  pushEnabled: boolean;
  pullEnabled: boolean;
  syncImages: boolean;
  /** Encryption key for outgoing clips (null = push plaintext) */
  encryptKey: E2EKey | null;
  verbose: boolean;
}

const PULL_COOLDOWN_MS = 2000;
const RECENT_HASHES = 8;

export class ClipboardWatcher {
  private client: ApiClient;
  private who: Identity;
  private ws: WebSocket | null = null;
  /**
   * Plaintext hashes of what we last pushed or wrote to the clipboard. Several, because
   * some platforms (Windows/macOS images, CRLF text) hand back different bytes than we wrote.
   */
  private recentHashes: string[] = [];
  private lastPullTimestamp = 0;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(private opts: WatcherOptions) {
    this.client = new ApiClient(opts.serverUrl, opts.apiKey);
    this.who = { deviceId: opts.deviceId, deviceName: opts.deviceName, platform: localPlatform() };
  }

  start(): void {
    this.running = true;
    this.log('Starting clipboard watcher...');
    this.log(`  Server: ${this.opts.serverUrl}`);
    this.log(`  Device: ${this.opts.deviceName} (${this.opts.deviceId})`);
    this.log(`  Push: ${this.opts.pushEnabled}, Pull: ${this.opts.pullEnabled}, Images: ${this.opts.syncImages}, Encrypt: ${!!this.opts.encryptKey}`);

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

  private remember(hash: string): void {
    this.recentHashes = [hash, ...this.recentHashes.filter((h) => h !== hash)].slice(0, RECENT_HASHES);
  }

  // ── Push direction: local clipboard → server ──

  private startClipboardWatch(): void {
    if (platform() === 'linux' && process.env.WAYLAND_DISPLAY) {
      this.watchWayland();
    } else {
      // X11, macOS, Windows: no change notifications available without native code
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
    let busy = false;
    setInterval(async () => {
      // A slow push (or PowerShell spawn) must not stack up overlapping reads
      if (busy) return;
      busy = true;
      try {
        await this.onClipboardChanged();
      } finally {
        busy = false;
      }
    }, 1000);
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
      const hasText = types.includes('text/plain');

      if (hasImage && this.opts.syncImages) {
        await this.pushClipboardImage();
      } else if (hasText) {
        await this.pushClipboardText();
      }
    } catch (err) {
      this.debug(`Clipboard read error: ${errMsg(err)}`);
    }
  }

  private async pushClipboardText(): Promise<void> {
    const text = readClipboardText();
    if (!text.trim()) return;

    // Dedup on plaintext — ciphertext differs every time (random IV)
    const hash = hashContent(text);
    if (this.recentHashes.includes(hash)) return;

    try {
      const key = this.opts.encryptKey;
      const clip = await this.client.pushText(
        key ? encryptClipText(text, key) : text,
        this.who,
        key ? { encrypted: true } : {},
      );
      this.remember(hash);
      this.log(`Pushed text (${Buffer.byteLength(text)}B${key ? ', encrypted' : ''}) → ${clip.id}`);
    } catch (err) {
      this.debug(`Push text failed: ${errMsg(err)}`);
    }
  }

  private async pushClipboardImage(): Promise<void> {
    try {
      const { data, mimeType } = readClipboardImage();
      const hash = hashContent(data);
      if (this.recentHashes.includes(hash)) return;

      const key = this.opts.encryptKey;
      const clip = await this.client.pushFile(
        key ? encryptClipBytes(data, key) : data,
        `clipboard.${extFromMime(mimeType)}`,
        mimeType,
        this.who,
        key ? { encrypted: true } : {},
      );
      this.remember(hash);
      this.log(`Pushed image (${data.length}B, ${mimeType}${key ? ', encrypted' : ''}) → ${clip.id}`);
    } catch (err) {
      this.debug(`Push image failed: ${errMsg(err)}`);
    }
  }

  // ── Pull direction: server → local clipboard ──

  private connectWebSocket(): void {
    const wsUrl = this.client.wsUrl();
    this.log(`Connecting to ${wsUrl.replace(/api_key=[^&]+/, 'api_key=***')}`);

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.log('WebSocket connected');
      ws.send(JSON.stringify({
        type: 'identify',
        device_id: this.opts.deviceId,
        device_name: this.opts.deviceName,
        platform: localPlatform(),
      }));
      void this.catchUp();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'new_clip') {
          void this.onRemoteClip(msg.clip as ClipResponse);
        }
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore
      }
    };

    ws.onclose = (event) => {
      if (!this.running) return;
      if (event.code === 4401) {
        this.log('WebSocket rejected: invalid or missing API key (set server.api_key)');
      }
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

  /** After (re)connecting, apply the newest remote clip if it arrived while we were offline */
  private async catchUp(): Promise<void> {
    try {
      const latest = await this.client.latest(this.opts.deviceId);
      if (!latest) return;
      const state = loadState(this.opts.deviceId);
      const decision = catchUpDecision(state?.last_seen_at ?? null, latest.created_at);
      if (decision === 'record') {
        // First ever run: don't clobber whatever the user has on their clipboard
        this.markSeen(latest);
        this.debug(`Catch-up: first run, recorded ${latest.id} without applying`);
      } else if (decision === 'apply') {
        this.log(`Catch-up: applying clip ${latest.id} missed while offline`);
        await this.onRemoteClip(latest);
      }
    } catch (err) {
      this.debug(`Catch-up failed: ${errMsg(err)}`);
    }
  }

  private markSeen(clip: ClipResponse): void {
    const state = loadState(this.opts.deviceId);
    if (state && state.last_seen_at >= clip.created_at) return;
    try {
      saveState(this.opts.deviceId, { last_seen_at: clip.created_at });
    } catch (err) {
      this.debug(`Could not save state: ${errMsg(err)}`);
    }
  }

  private async onRemoteClip(clip: ClipResponse): Promise<void> {
    const skip = shouldApplyRemote(clip, this.opts.deviceId, this.opts.syncImages);
    if (skip) {
      this.debug(`Ignoring clip ${clip.id}: ${skip}`);
      // Still counts as seen (e.g. a one-time clip shouldn't be re-considered on reconnect)
      if (clip.device_id !== this.opts.deviceId) this.markSeen(clip);
      return;
    }

    try {
      if (clip.type === 'text' && clip.content !== null) {
        const text = clip.encrypted ? decryptClipText(clip.content, this.opts.config) : clip.content;
        writeClipboardText(text);
        this.lastPullTimestamp = Date.now();
        this.remember(hashContent(text));
        this.rememberReadback(() => readClipboardText());
        this.log(`Pulled text from ${clip.device_name} (${Buffer.byteLength(text)}B${clip.encrypted ? ', decrypted' : ''}) → clipboard`);
      } else if (clip.type === 'image' && clip.file_url) {
        const raw = await this.client.fetchBlob(clip.file_url);
        const data = clip.encrypted ? decryptClipBytes(raw, this.opts.config) : raw;
        writeClipboardImage(data, clip.mime_type);
        this.lastPullTimestamp = Date.now();
        this.remember(hashContent(data));
        this.rememberReadback(() => readClipboardImage().data);
        this.log(`Pulled image from ${clip.device_name} (${data.length}B${clip.encrypted ? ', decrypted' : ''}) → clipboard`);
      }
      this.markSeen(clip);
    } catch (err) {
      // Includes "no passphrase" / "wrong passphrase" for encrypted clips
      this.log(`Pull to clipboard failed (${clip.id}): ${errMsg(err)}`);
    }
  }

  /**
   * Some platforms re-encode on write (Windows/macOS images → PNG, CRLF line endings).
   * Remember what the clipboard now reports so the next poll doesn't push it back.
   */
  private rememberReadback(read: () => string | Buffer): void {
    if (platform() === 'linux') return; // wl-clipboard/xclip return the exact bytes
    try {
      this.remember(hashContent(read()));
    } catch {
      // best effort
    }
  }
}
