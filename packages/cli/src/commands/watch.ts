import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ClipboardWatcher } from '../watcher.js';
import { getKey, requireKey } from '../lib/e2e.js';

export const watchCommand = new Command('watch')
  .description('Watch clipboard and sync bidirectionally (daemon mode)')
  .option('--push-only', 'Only push local changes, do not pull')
  .option('--pull-only', 'Only pull remote changes, do not push')
  .option('--no-images', 'Do not sync images')
  .option('--encrypt', 'End-to-end encrypt pushed clips (default: config encryption.enabled)')
  .option('--no-encrypt', 'Push plaintext even if encryption.enabled is set')
  .option('-v, --verbose', 'Verbose logging')
  .option('-s, --server <url>', 'Server URL override')
  .option('-d, --device <name>', 'Device name override')
  .action((opts: {
    pushOnly?: boolean; pullOnly?: boolean; images: boolean; encrypt?: boolean;
    verbose?: boolean; server?: string; device?: string;
  }) => {
    const config = loadConfig();

    const encrypt = opts.encrypt ?? config.encryption.enabled;
    let encryptKey;
    try {
      // Derive once up front — PBKDF2 is intentionally slow. Also used to decrypt incoming clips.
      encryptKey = encrypt ? requireKey(config) : null;
      if (!encrypt) getKey(config);
    } catch (err) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    const watcher = new ClipboardWatcher({
      config,
      serverUrl: opts.server || config.server.url,
      apiKey: config.server.api_key,
      deviceId: config.device.id,
      deviceName: opts.device || config.device.name,
      pushEnabled: !opts.pullOnly,
      pullEnabled: !opts.pushOnly,
      syncImages: opts.images !== false,
      encryptKey,
      verbose: !!opts.verbose,
    });

    watcher.start();
  });
