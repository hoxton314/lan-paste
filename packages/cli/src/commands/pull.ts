import { Command } from 'commander';
import chalk from 'chalk';
import { getContext } from '../lib/context.js';
import { deliverClip } from '../lib/output.js';
import { errMsg } from '../lib/util.js';

export const pullCommand = new Command('pull')
  .description('Pull latest clip from LAN Paste')
  .option('-c, --clipboard', 'Copy to system clipboard instead of stdout')
  .option('-o, --output <path>', 'Save to file')
  .option('-a, --all', 'Include own clips (default: exclude)')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { clipboard?: boolean; output?: string; all?: boolean; server?: string }) => {
    const { config, client } = getContext(opts);

    try {
      // With our device id the server also skips clips targeted at other devices
      const clip = await client.latest(opts.all ? undefined : config.device.id);
      if (!clip) {
        console.error(chalk.yellow('No clips available.'));
        process.exit(0);
      }
      await deliverClip(client, config, clip, opts);
    } catch (err) {
      console.error(chalk.red(errMsg(err)));
      process.exit(1);
    }
  });
