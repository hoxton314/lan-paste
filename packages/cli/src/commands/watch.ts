import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { ClipboardWatcher } from '../watcher.js';

export const watchCommand = new Command('watch')
  .description('Watch clipboard and sync bidirectionally (daemon mode)')
  .option('--push-only', 'Only push local changes, do not pull')
  .option('--pull-only', 'Only pull remote changes, do not push')
  .option('--no-images', 'Do not sync images')
  .option('-v, --verbose', 'Verbose logging')
  .option('-s, --server <url>', 'Server URL override')
  .option('-d, --device <name>', 'Device name override')
  .action((opts: {
    pushOnly?: boolean; pullOnly?: boolean; images: boolean;
    verbose?: boolean; server?: string; device?: string;
  }) => {
    const config = loadConfig();

    const watcher = new ClipboardWatcher({
      serverUrl: opts.server || config.server.url,
      apiKey: config.server.api_key,
      deviceId: config.device.id,
      deviceName: opts.device || config.device.name,
      pushEnabled: !opts.pullOnly,
      pullEnabled: !opts.pushOnly,
      syncImages: opts.images !== false,
      verbose: !!opts.verbose,
    });

    watcher.start();
  });
