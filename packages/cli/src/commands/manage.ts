import { Command } from 'commander';
import chalk from 'chalk';
import { getContext } from '../lib/context.js';
import { errMsg, timeAgo } from '../lib/util.js';

export const deleteCommand = new Command('delete')
  .alias('rm')
  .description('Delete one or more clips')
  .argument('<ids...>', 'Clip ids')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (ids: string[], opts: { server?: string }) => {
    const { client } = getContext(opts);
    let failed = 0;
    for (const id of ids) {
      try {
        await client.delete(id);
        console.log(chalk.green(`Deleted ${id}`));
      } catch (err) {
        failed++;
        console.error(chalk.red(`${id}: ${errMsg(err)}`));
      }
    }
    if (failed) process.exit(1);
  });

function pinAction(pinned: boolean) {
  return async (id: string, opts: { server?: string }) => {
    const { client } = getContext(opts);
    try {
      await client.setPinned(id, pinned);
      console.log(chalk.green(pinned ? `📌 Pinned ${id} (kept forever)` : `Unpinned ${id}`));
    } catch (err) {
      console.error(chalk.red(errMsg(err)));
      process.exit(1);
    }
  };
}

export const pinCommand = new Command('pin')
  .description('Pin a clip so retention cleanup never deletes it')
  .argument('<id>', 'Clip id')
  .option('-s, --server <url>', 'Server URL override')
  .action(pinAction(true));

export const unpinCommand = new Command('unpin')
  .description('Unpin a clip')
  .argument('<id>', 'Clip id')
  .option('-s, --server <url>', 'Server URL override')
  .action(pinAction(false));

export const devicesCommand = new Command('devices')
  .description('List known devices and whether they are online')
  .option('--json', 'Output as JSON')
  .option('-s, --server <url>', 'Server URL override')
  .action(async (opts: { json?: boolean; server?: string }) => {
    const { client, config } = getContext(opts);
    try {
      const devices = await client.devices();
      if (opts.json) {
        console.log(JSON.stringify(devices, null, 2));
        return;
      }
      if (devices.length === 0) {
        console.log(chalk.yellow('No devices yet.'));
        return;
      }
      console.log(chalk.gray('  ' + 'NAME'.padEnd(20) + 'ID'.padEnd(23) + 'PLATFORM'.padEnd(10) + 'LAST SEEN'));
      for (const d of devices) {
        const dot = d.online ? chalk.green('●') : chalk.gray('○');
        const self = d.id === config.device.id ? chalk.dim(' (this device)') : '';
        console.log(
          `${dot} ` +
            chalk.magenta(d.name.slice(0, 18).padEnd(20)) +
            chalk.white(d.id.padEnd(23)) +
            chalk.cyan(d.platform.padEnd(10)) +
            chalk.gray(d.online ? 'online' : timeAgo(d.last_seen)) +
            self,
        );
      }
    } catch (err) {
      console.error(chalk.red(`Failed: ${errMsg(err)}`));
      process.exit(1);
    }
  });
