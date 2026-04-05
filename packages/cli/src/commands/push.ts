import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';
import { readClipboardText, readClipboardImage, clipboardHasImage } from '../clipboard/index.js';

export const pushCommand = new Command('push')
  .description('Push text or image to LAN Paste')
  .argument('[text]', 'Text to push (omit to read from stdin or clipboard)')
  .option('-c, --clipboard', 'Read from system clipboard')
  .option('-i, --image', 'Read image from clipboard (combine with -c)')
  .option('-f, --file <path>', 'Push an image file')
  .option('-s, --server <url>', 'Server URL override')
  .option('-d, --device <name>', 'Device name override')
  .action(async (text: string | undefined, opts: {
    clipboard?: boolean; image?: boolean; file?: string;
    server?: string; device?: string;
  }) => {
    const config = loadConfig();
    const serverUrl = opts.server || config.server.url;
    const deviceName = opts.device || config.device.name;
    const client = new ApiClient(serverUrl, config.server.api_key);

    const spinner = ora('Pushing...').start();

    try {
      // Image file
      if (opts.file) {
        const clip = await client.pushImageFile(opts.file, config.device.id, deviceName);
        spinner.succeed(`Pushed image ${chalk.cyan(clip.id)} (${clip.filename}, ${clip.size_bytes}B)`);
        return;
      }

      // Clipboard image
      if (opts.clipboard && opts.image) {
        const { data, mimeType } = readClipboardImage();
        const ext = mimeType.split('/')[1] || 'png';
        const clip = await client.pushImage(data, `clipboard.${ext}`, mimeType, config.device.id, deviceName);
        spinner.succeed(`Pushed clipboard image ${chalk.cyan(clip.id)} (${clip.size_bytes}B)`);
        return;
      }

      // Auto-detect: if --clipboard and clipboard has image (no explicit text), push image
      if (opts.clipboard && !text && clipboardHasImage()) {
        try {
          const { data, mimeType } = readClipboardImage();
          const ext = mimeType.split('/')[1] || 'png';
          const clip = await client.pushImage(data, `clipboard.${ext}`, mimeType, config.device.id, deviceName);
          spinner.succeed(`Pushed clipboard image ${chalk.cyan(clip.id)} (${clip.size_bytes}B)`);
          return;
        } catch {
          // Fall through to text
        }
      }

      // Text from argument, clipboard, or stdin
      let content: string;

      if (text) {
        content = text;
      } else if (opts.clipboard) {
        content = readClipboardText();
      } else if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        content = Buffer.concat(chunks).toString('utf8');
      } else {
        spinner.fail('No input. Provide text, --clipboard, --file, or pipe via stdin.');
        process.exit(1);
      }

      if (!content.trim()) {
        spinner.fail('Empty content, nothing to push.');
        process.exit(1);
      }

      const clip = await client.pushText(content, config.device.id, deviceName);
      spinner.succeed(`Pushed ${chalk.cyan(clip.id)} (${clip.size_bytes}B)`);
    } catch (err) {
      spinner.fail(`Push failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });
