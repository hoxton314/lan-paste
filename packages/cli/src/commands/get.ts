import { Command } from 'commander';
import chalk from 'chalk';
import { getContext } from '../lib/context.js';
import { deliverClip } from '../lib/output.js';
import { errMsg } from '../lib/util.js';

export const getCommand = new Command('get')
  .description('Get a specific clip by id (one-time clips are consumed)')
  .argument('<id>', 'Clip id (see `lan-paste history`)')
  .option('-c, --clipboard', 'Copy to system clipboard instead of stdout')
  .option('-o, --output <path>', 'Save to file')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (id: string, opts: { clipboard?: boolean; output?: string; server?: string }) => {
    const { config, client } = getContext(opts);

    try {
      let clip = await client.get(id);
      if (clip.burn_after_read) {
        if (clip.type === 'text') clip = await client.reveal(id);
        console.error(chalk.yellow('🔥 One-time clip — it has now been deleted from the server.'));
      }
      await deliverClip(client, config, clip, opts);
    } catch (err) {
      console.error(chalk.red(errMsg(err)));
      process.exit(1);
    }
  });
