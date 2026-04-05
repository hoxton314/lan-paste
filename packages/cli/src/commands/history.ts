import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const historyCommand = new Command('history')
  .description('List recent clips')
  .option('-n, --limit <n>', 'Number of clips', '20')
  .option('-t, --type <type>', 'Filter by type (text|image)')
  .option('--json', 'Output as JSON')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { limit: string; type?: string; json?: boolean; server?: string }) => {
    const config = loadConfig();
    const serverUrl = opts.server || config.server.url;
    const client = new ApiClient(serverUrl, config.server.api_key);

    try {
      const result = await client.list(Number(opts.limit), 0, opts.type);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (result.clips.length === 0) {
        console.log(chalk.yellow('No clips.'));
        return;
      }

      console.log(
        chalk.gray(
          'ID'.padEnd(22) + 'TYPE'.padEnd(7) + 'SIZE'.padEnd(9) + 'DEVICE'.padEnd(18) + 'AGE'.padEnd(10) + 'PREVIEW',
        ),
      );

      for (const clip of result.clips) {
        const preview =
          clip.type === 'text' && clip.content
            ? clip.content.replace(/\n/g, ' ').slice(0, 50)
            : clip.filename || '(image)';

        console.log(
          chalk.white(clip.id.slice(0, 20).padEnd(22)) +
            chalk.cyan(clip.type.padEnd(7)) +
            formatSize(clip.size_bytes).padEnd(9) +
            chalk.magenta(clip.device_name.slice(0, 16).padEnd(18)) +
            chalk.gray(timeAgo(clip.created_at).padEnd(10)) +
            chalk.dim(preview),
        );
      }

      console.log(chalk.gray(`\n${result.total} total clip(s)`));
    } catch (err) {
      console.error(chalk.red(`Failed: ${err instanceof Error ? err.message : err}`));
      process.exit(1);
    }
  });
