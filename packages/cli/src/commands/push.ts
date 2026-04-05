import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';
import { readClipboardText } from '../clipboard/index.js';

export const pushCommand = new Command('push')
  .description('Push text to LAN Paste')
  .argument('[text]', 'Text to push (omit to read from stdin or clipboard)')
  .option('-c, --clipboard', 'Read from system clipboard')
  .option('-s, --server <url>', 'Server URL override')
  .option('-d, --device <name>', 'Device name override')
  .action(async (text: string | undefined, opts: { clipboard?: boolean; server?: string; device?: string }) => {
    const config = loadConfig();
    const serverUrl = opts.server || config.server.url;
    const deviceName = opts.device || config.device.name;
    const client = new ApiClient(serverUrl, config.server.api_key);

    let content: string;

    if (text) {
      content = text;
    } else if (opts.clipboard) {
      content = readClipboardText();
    } else if (!process.stdin.isTTY) {
      // Read from stdin
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      content = Buffer.concat(chunks).toString('utf8');
    } else {
      console.error(chalk.red('No input. Provide text as argument, --clipboard flag, or pipe via stdin.'));
      process.exit(1);
    }

    if (!content.trim()) {
      console.error(chalk.red('Empty content, nothing to push.'));
      process.exit(1);
    }

    const spinner = ora('Pushing...').start();
    try {
      const clip = await client.push(content, config.device.id, deviceName);
      spinner.succeed(`Pushed ${chalk.cyan(clip.id)} (${clip.size_bytes}B)`);
    } catch (err) {
      spinner.fail(`Push failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
