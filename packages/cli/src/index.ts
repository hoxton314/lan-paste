#!/usr/bin/env node
import { Command } from 'commander';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { historyCommand } from './commands/history.js';

const program = new Command()
  .name('lan-paste')
  .description('Cross-device clipboard sharing over Tailscale/LAN')
  .version('0.1.0');

program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(historyCommand);

program.parse();
