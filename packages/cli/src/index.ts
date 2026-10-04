#!/usr/bin/env node
import { Command } from 'commander';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { getCommand } from './commands/get.js';
import { historyCommand } from './commands/history.js';
import { deleteCommand, pinCommand, unpinCommand, devicesCommand } from './commands/manage.js';
import { watchCommand } from './commands/watch.js';
import { configCommand } from './commands/config.js';

const program = new Command()
  .name('lan-paste')
  .description('Cross-device clipboard sharing over Tailscale/LAN')
  .version('0.1.0');

program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(getCommand);
program.addCommand(historyCommand);
program.addCommand(deleteCommand);
program.addCommand(pinCommand);
program.addCommand(unpinCommand);
program.addCommand(devicesCommand);
program.addCommand(watchCommand);
program.addCommand(configCommand);

program.parse();
