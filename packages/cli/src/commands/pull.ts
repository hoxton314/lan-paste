import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';
import { writeClipboardText } from '../clipboard/index.js';

export const pullCommand = new Command('pull')
  .description('Pull latest clip from LAN Paste')
  .option('-c, --clipboard', 'Copy to system clipboard instead of stdout')
  .option('-a, --all', 'Include own clips (default: exclude)')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { clipboard?: boolean; all?: boolean; server?: string }) => {
    const config = loadConfig();
    const serverUrl = opts.server || config.server.url;
    const client = new ApiClient(serverUrl, config.server.api_key);

    const excludeDevice = opts.all ? undefined : config.device.id;

    try {
      const clip = await client.latest(excludeDevice);
      if (!clip) {
        console.error(chalk.yellow('No clips available.'));
        process.exit(0);
      }

      if (clip.type === 'text' && clip.content) {
        if (opts.clipboard) {
          writeClipboardText(clip.content);
          console.error(chalk.green(`Copied to clipboard (${clip.size_bytes}B from ${clip.device_name})`));
        } else {
          process.stdout.write(clip.content);
        }
      } else {
        console.error(chalk.yellow(`Latest clip is ${clip.type}, text pull not supported yet.`));
        process.exit(1);
      }
    } catch (err) {
      console.error(chalk.red(`Pull failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });
