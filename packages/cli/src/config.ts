import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, hostname } from 'node:os';
import { parse, stringify } from 'smol-toml';
import { nanoid } from 'nanoid';
import type { LanPasteConfig } from '@lan-paste/shared';
import { DEFAULT_PORT } from '@lan-paste/shared';

const CONFIG_DIR = join(homedir(), '.config', 'lan-paste');
const CONFIG_PATH = join(CONFIG_DIR, 'config.toml');

function defaults(): LanPasteConfig {
  return {
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
    encryption: {
      enabled: false,
      passphrase: '',
    },
  };
}

function readConfigFile(): Partial<LanPasteConfig> | null {
  let raw: string;
  try {
    raw = readFileSync(getConfigPath(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  try {
    return parse(raw) as unknown as Partial<LanPasteConfig>;
  } catch (err) {
    throw new Error(`Invalid config file ${getConfigPath()}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Load config from file only (no env overrides) — use this before saving. */
export function loadFileConfig(): LanPasteConfig {
  const base = defaults();
  const parsed = readConfigFile();
  const config: LanPasteConfig = {
    server: { ...base.server, ...parsed?.server },
    device: { ...base.device, ...parsed?.device },
    sync: { ...base.sync, ...parsed?.sync },
    encryption: { ...base.encryption, ...parsed?.encryption },
  };

  // The device ID must be stable across runs, otherwise "exclude own clips"
  // and loop prevention break. Persist a freshly generated one.
  if (!parsed?.device?.id) {
    try {
      saveConfig(config);
    } catch {
      // read-only home etc. — fall back to an ephemeral ID
    }
  }

  return config;
}

export function loadConfig(): LanPasteConfig {
  const config = loadFileConfig();

  // Env vars take precedence
  const envUrl = process.env.LAN_PASTE_SERVER_URL;
  const envName = process.env.LAN_PASTE_DEVICE_NAME;
  const envApiKey = process.env.LAN_PASTE_API_KEY;
  if (envUrl) config.server.url = envUrl;
  if (envName) config.device.name = envName;
  if (envApiKey) config.server.api_key = envApiKey;
  const envPassphrase = process.env.LAN_PASTE_PASSPHRASE;
  if (envPassphrase) config.encryption.passphrase = envPassphrase;

  return config;
}

export function saveConfig(config: LanPasteConfig): void {
  const path = getConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(config as unknown as Record<string, unknown>), { mode: 0o600 });
}

export function getConfigPath(): string {
  return process.env.LAN_PASTE_CONFIG || CONFIG_PATH;
}
