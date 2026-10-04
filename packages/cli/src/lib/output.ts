import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import type { ClipResponse, LanPasteConfig } from '@lan-paste/shared';
import type { ApiClient } from '../client.js';
import { writeClipboardText, writeClipboardImage } from '../clipboard/index.js';
import { decryptClipBytes, decryptClipText } from './e2e.js';
import { formatSize, safeFilename, uniquePath } from './util.js';

export interface DeliverOptions {
  clipboard?: boolean;
  output?: string;
}

/**
 * Write a clip to stdout / clipboard / a file, decrypting if needed.
 * For one-time clips the caller must already have revealed the text (content set);
 * downloading a one-time file consumes it server-side.
 */
export async function deliverClip(
  client: ApiClient,
  config: LanPasteConfig,
  clip: ClipResponse,
  opts: DeliverOptions,
): Promise<void> {
  const from = `from ${clip.device_name}`;

  if (clip.type === 'text') {
    if (clip.content === null) throw new Error('Clip has no content (one-time clip already read?)');
    const text = clip.encrypted ? decryptClipText(clip.content, config) : clip.content;
    if (opts.output) {
      writeFileSync(opts.output, text);
      console.error(chalk.green(`Saved text to ${opts.output} (${formatSize(Buffer.byteLength(text))} ${from})`));
    } else if (opts.clipboard) {
      writeClipboardText(text);
      console.error(chalk.green(`Copied text to clipboard (${formatSize(Buffer.byteLength(text))} ${from})`));
    } else {
      process.stdout.write(text);
    }
    return;
  }

  const url = clip.file_url ?? clip.image_url;
  if (!url) throw new Error('Clip has no downloadable content');
  const raw = await client.fetchBlob(url);
  const data = clip.encrypted ? decryptClipBytes(raw, config) : raw;

  if (opts.output) {
    writeFileSync(opts.output, data);
    console.error(chalk.green(`Saved ${clip.type} to ${opts.output} (${formatSize(data.length)} ${from})`));
    return;
  }

  if (clip.type === 'image') {
    if (opts.clipboard) {
      writeClipboardImage(data, clip.mime_type);
      console.error(chalk.green(`Copied image to clipboard (${formatSize(data.length)} ${from})`));
    } else {
      // Output raw image to stdout (for piping)
      process.stdout.write(data);
    }
    return;
  }

  // Generic file: raw bytes when piped, otherwise save next to the user without overwriting
  if (opts.clipboard) console.error(chalk.yellow('Files cannot be put on the clipboard; saving instead.'));
  if (!process.stdout.isTTY && !opts.clipboard) {
    process.stdout.write(data);
    return;
  }
  const path = uniquePath(join(process.cwd(), safeFilename(clip.filename, `${clip.id}.bin`)));
  writeFileSync(path, data);
  console.error(chalk.green(`Saved file to ${path} (${formatSize(data.length)} ${from})`));
}
