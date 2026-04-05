import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';
import { writeClipboardText, writeClipboardImage } from '../clipboard/index.js';

export const pullCommand = new Command('pull')
  .description('Pull latest clip from LAN Paste')
  .option('-c, --clipboard', 'Copy to system clipboard instead of stdout')
  .option('-o, --output <path>', 'Save image to file')
  .option('-a, --all', 'Include own clips (default: exclude)')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { clipboard?: boolean; output?: string; all?: boolean; server?: string }) => {
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
          console.error(chalk.green(`Copied text to clipboard (${clip.size_bytes}B from ${clip.device_name})`));
        } else {
          process.stdout.write(clip.content);
        }
        return;
      }

      if (clip.type === 'image' && clip.image_url) {
        const imageData = await client.fetchImage(clip.image_url);

        if (opts.output) {
          writeFileSync(opts.output, imageData);
          console.error(chalk.green(`Saved image to ${opts.output} (${imageData.length}B from ${clip.device_name})`));
        } else if (opts.clipboard) {
          writeClipboardImage(imageData, clip.mime_type);
          console.error(chalk.green(`Copied image to clipboard (${imageData.length}B from ${clip.device_name})`));
        } else {
          // Output raw image to stdout (for piping)
          process.stdout.write(imageData);
        }
        return;
      }

      console.error(chalk.yellow('Unknown clip type.'));
    } catch (err) {
      console.error(chalk.red(`Pull failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });
