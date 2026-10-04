import { Command } from 'commander';
import chalk from 'chalk';
import type { ClipResponse, LanPasteConfig } from '@lan-paste/shared';
import { getContext } from '../lib/context.js';
import { decryptClipText } from '../lib/e2e.js';
import { errMsg, formatSize, timeAgo } from '../lib/util.js';

function preview(clip: ClipResponse, config: LanPasteConfig): string {
  if (clip.burn_after_read) return '(one-time)';
  if (clip.type !== 'text') return clip.filename || `(${clip.type})`;
  if (clip.content === null) return '';
  let text = clip.content;
  if (clip.encrypted) {
    if (!config.encryption.passphrase) return '(encrypted)';
    try {
      text = decryptClipText(clip.content, config);
    } catch {
      return '(encrypted)';
    }
  }
  return text.replace(/\s+/g, ' ').slice(0, 50);
}

export const historyCommand = new Command('history')
  .description('List recent clips')
  .option('-n, --limit <n>', 'Number of clips', '20')
  .option('-t, --type <type>', 'Filter by type (text|image|file)')
  .option('-q, --search <query>', 'Full-text search in text and filenames')
  .option('--pinned', 'Only pinned clips')
  .option('--json', 'Output as JSON')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { limit: string; type?: string; search?: string; pinned?: boolean; json?: boolean; server?: string }) => {
    const { config, client } = getContext(opts);

    try {
      const result = await client.list({
        limit: Number(opts.limit),
        type: opts.type,
        q: opts.search,
        pinned: opts.pinned,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.clips.length === 0) {
        console.log(chalk.yellow(opts.search ? `No clips match "${opts.search}".` : 'No clips.'));
        return;
      }

      // Resolve target device names only when needed
      let deviceNames = new Map<string, string>();
      if (result.clips.some((c) => c.target_device_id)) {
        try {
          deviceNames = new Map((await client.devices()).map((d) => [d.id, d.name]));
        } catch {
          // fall back to ids
        }
      }

      console.log(
        chalk.gray(
          'ID'.padEnd(23) + 'TYPE'.padEnd(7) + 'SIZE'.padEnd(9) + 'DEVICE'.padEnd(18) + 'AGE'.padEnd(10) + 'PREVIEW',
        ),
      );

      for (const clip of result.clips) {
        const markers = [
          clip.pinned && '📌',
          clip.encrypted && '🔒',
          clip.burn_after_read && '🔥',
          clip.target_device_id && `→ ${deviceNames.get(clip.target_device_id) ?? clip.target_device_id}`,
        ].filter(Boolean).join(' ');

        console.log(
          chalk.white(clip.id.padEnd(23)) +
            chalk.cyan(clip.type.padEnd(7)) +
            formatSize(clip.size_bytes).padEnd(9) +
            chalk.magenta(clip.device_name.slice(0, 16).padEnd(18)) +
            chalk.gray(timeAgo(clip.created_at).padEnd(10)) +
            (markers ? chalk.yellow(markers) + ' ' : '') +
            chalk.dim(preview(clip, config)),
        );
      }

      console.log(chalk.gray(`\n${result.total} total clip(s)`));
    } catch (err) {
      console.error(chalk.red(`Failed: ${errMsg(err)}`));
      process.exit(1);
    }
  });
