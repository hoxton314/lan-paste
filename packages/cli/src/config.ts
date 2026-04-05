import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse, stringify } from 'smol-toml';
import { nanoid } from 'nanoid';
import { hostname } from 'node:os';
import type { LanPasteConfig } from '@lan-paste/shared';
import { DEFAULT_PORT } from '@lan-paste/shared';

const CONFIG_DIR = join(homedir(), '.config', 'lan-paste');
const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');

const defaults: LanPasteConfig = {
  server: {
    url: `http://localhost:${DEFAULT_PORT}`,
  },
  device: {
    id: nanoid(),
    name: hostname(),
  },
  sync: {
    auto: true,
    push: true,
    pull: true,
    images: true,
    max_size_mb: 10,
  },
};

export function loadConfig(): LanPasteConfig {
  // Env vars take precedence
  const envUrl = process.env.LAN_PASTE_SERVER_URL;
  const envName = process.env.LAN_PASTE_DEVICE_NAME;
  const envApiKey = process.env.LAN_PASTE_API_KEY;

  try {
    const raw = readFileSync(process.env.LAN_PASTE_CONFIG || CONFIG_PATH, 'utf8');
    const parsed = parse(raw) as unknown as Partial<LanPasteConfig>;
    const config: LanPasteConfig = {
      server: { ...defaults.server, ...parsed.server },
      device: { ...defaults.device, ...parsed.device },
      sync: { ...defaults.sync, ...parsed.sync },
    };
    if (envUrl) config.server.url = envUrl;
    if (envName) config.device.name = envName;
    if (envApiKey) config.server.api_key = envApiKey;
    return config;
  } catch {
    // No config file, use defaults
    const config = { ...defaults };
    if (envUrl) config.server.url = envUrl;
    if (envName) config.device.name = envName;
    if (envApiKey) config.server.api_key = envApiKey;
    return config;
  }
}

export function saveConfig(config: LanPasteConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, stringify(config as Record<string, unknown>));
}

export function getConfigPath(): string {
  return process.env.LAN_PASTE_CONFIG || CONFIG_PATH;
}
