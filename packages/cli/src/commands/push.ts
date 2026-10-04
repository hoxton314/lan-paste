import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import type { ClipResponse, PushOptions } from '@lan-paste/shared';
import { resolveDevice } from '../client.js';
import { readClipboardText, readClipboardImage, clipboardHasImage } from '../clipboard/index.js';
import { getContext } from '../lib/context.js';
import { encryptClipBytes, encryptClipText, requireKey } from '../lib/e2e.js';
import { errMsg, extFromMime, formatSize, mimeFromFilename, parseDuration } from '../lib/util.js';

interface PushCliOptions {
  clipboard?: boolean;
  image?: boolean;
  file?: string;
  server?: string;
  device?: string;
  expire?: string;
  once?: boolean;
  to?: string;
  encrypt?: boolean;
}

export const pushCommand = new Command('push')
  .description('Push text, an image or any file to LAN Paste')
  .argument('[text]', 'Text to push (omit to read from stdin or clipboard)')
  .option('-c, --clipboard', 'Read from system clipboard')
  .option('-i, --image', 'Read image from clipboard (combine with -c)')
  .option('-f, --file <path>', 'Push a file (images are shown inline, anything else as a download)')
  .option('--expire <duration>', 'Delete after a duration, e.g. 30s, 10m, 2h, 1d')
  .option('--once', 'One-time clip: deleted after it is read once')
  .option('--to <device>', 'Send to one device (name or id); other devices will not auto-apply it')
  .option('--encrypt', 'End-to-end encrypt (default: config encryption.enabled)')
  .option('--no-encrypt', 'Do not encrypt, even if encryption.enabled is set')
  .option('-s, --server <url>', 'Server URL override')
  .option('-d, --device <name>', 'Device name override')
  .action(async (text: string | undefined, opts: PushCliOptions) => {
    const { config, client, who } = getContext(opts);
    const spinner = ora('Pushing...').start();

    try {
      const pushOpts: PushOptions = {};
      if (opts.expire) pushOpts.expires_in = parseDuration(opts.expire);
      if (opts.once) pushOpts.burn_after_read = true;
      if (opts.to) {
        const target = resolveDevice(await client.devices(), opts.to);
        pushOpts.target_device_id = target.id;
      }

      // --encrypt / --no-encrypt override the config default
      const encrypt = opts.encrypt ?? config.encryption.enabled;
      if (encrypt) {
        spinner.text = 'Deriving encryption key...';
        pushOpts.encrypted = true;
      }
      const key = encrypt ? requireKey(config) : null;
      spinner.text = 'Pushing...';

      const pushBinary = (data: Buffer, filename: string, mime: string): Promise<ClipResponse> =>
        client.pushFile(key ? encryptClipBytes(data, key) : data, filename, mime, who, pushOpts);

      const suffix = (clip: ClipResponse) => {
        const flags = [
          clip.encrypted && '🔒 encrypted',
          clip.burn_after_read && '🔥 one-time',
          clip.expires_at && `expires ${new Date(clip.expires_at).toLocaleString()}`,
          opts.to && `→ ${opts.to}`,
        ].filter(Boolean);
        return flags.length ? chalk.dim(` [${flags.join(', ')}]`) : '';
      };

      // File (any type)
      if (opts.file) {
        const data = readFileSync(opts.file);
        const name = basename(opts.file);
        const clip = await pushBinary(data, name, mimeFromFilename(name));
        spinner.succeed(`Pushed ${clip.type} ${chalk.cyan(clip.id)} (${name}, ${formatSize(data.length)})${suffix(clip)}`);
        return;
      }

      // Clipboard image: explicit (-c -i) or auto-detected (-c with an image on the clipboard)
      if (opts.clipboard && !text && (opts.image || clipboardHasImage())) {
        try {
          const { data, mimeType } = readClipboardImage();
          const clip = await pushBinary(data, `clipboard.${extFromMime(mimeType)}`, mimeType);
          spinner.succeed(`Pushed clipboard image ${chalk.cyan(clip.id)} (${formatSize(data.length)})${suffix(clip)}`);
          return;
        } catch (err) {
          if (opts.image) throw err;
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

      const clip = await client.pushText(key ? encryptClipText(content, key) : content, who, pushOpts);
      spinner.succeed(`Pushed ${chalk.cyan(clip.id)} (${formatSize(Buffer.byteLength(content))})${suffix(clip)}`);
    } catch (err) {
      spinner.fail(`Push failed: ${errMsg(err)}`);
      process.exit(1);
    }
  });
