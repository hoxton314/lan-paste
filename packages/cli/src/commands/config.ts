import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import chalk from 'chalk';
import { hostname } from 'node:os';
import { nanoid } from 'nanoid';
import { DEFAULT_PORT } from '@lan-paste/shared';
import { loadConfig, saveConfig, getConfigPath } from '../config.js';
import type { LanPasteConfig } from '@lan-paste/shared';

async function ask(rl: ReturnType<typeof createInterface>, prompt: string, defaultVal: string): Promise<string> {
  const answer = await rl.question(`${prompt} [${chalk.dim(defaultVal)}]: `);
  return answer.trim() || defaultVal;
}

const configCommand = new Command('config').description('Manage configuration');

configCommand
  .command('init')
  .description('Interactive first-run setup')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log(chalk.bold('\nLAN Paste — Configuration\n'));

    const serverUrl = await ask(rl, 'Server URL', `http://localhost:${DEFAULT_PORT}`);
    const deviceName = await ask(rl, 'Device name', hostname());
    const deviceId = nanoid();

    const config: LanPasteConfig = {
      server: { url: serverUrl },
      device: { id: deviceId, name: deviceName },
      sync: { auto: true, push: true, pull: true, images: true, max_size_mb: 10 },
    };

    saveConfig(config);
    rl.close();

    console.log(`\n${chalk.green('Config saved to')} ${getConfigPath()}`);
    console.log(`  Device ID: ${chalk.cyan(deviceId)}`);
    console.log(`  Device name: ${chalk.cyan(deviceName)}`);
    console.log(`  Server: ${chalk.cyan(serverUrl)}\n`);
  });

configCommand
  .command('show')
  .description('Print current configuration')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.bold('\nCurrent configuration:\n'));
    console.log(`  Config file: ${chalk.dim(getConfigPath())}`);
    console.log(`  Server URL:  ${chalk.cyan(config.server.url)}`);
    console.log(`  API key:     ${config.server.api_key ? chalk.yellow('(set)') : chalk.dim('(none)')}`);
    console.log(`  Device ID:   ${chalk.cyan(config.device.id)}`);
    console.log(`  Device name: ${chalk.cyan(config.device.name)}`);
    console.log(`  Auto sync:   ${config.sync.auto ? chalk.green('on') : chalk.red('off')}`);
    console.log(`  Push:        ${config.sync.push ? chalk.green('on') : chalk.red('off')}`);
    console.log(`  Pull:        ${config.sync.pull ? chalk.green('on') : chalk.red('off')}`);
    console.log(`  Images:      ${config.sync.images ? chalk.green('on') : chalk.red('off')}`);
    console.log(`  Max size:    ${config.sync.max_size_mb}MB\n`);
  });

configCommand
  .command('set <key> <value>')
  .description('Set a config value (e.g. server.url http://100.64.0.1:3456)')
  .action((key: string, value: string) => {
    const config = loadConfig();

    const parts = key.split('.');
    if (parts.length !== 2) {
      console.error(chalk.red('Key must be section.key (e.g. server.url, device.name)'));
      process.exit(1);
    }

    const [section, field] = parts;
    const obj = config[section as keyof LanPasteConfig];
    if (!obj || typeof obj !== 'object') {
      console.error(chalk.red(`Unknown section: ${section}`));
      process.exit(1);
    }

    if (!(field in obj)) {
      console.error(chalk.red(`Unknown key: ${key}`));
      process.exit(1);
    }

    // Type coerce booleans and numbers
    const current = (obj as Record<string, unknown>)[field];
    if (typeof current === 'boolean') {
      (obj as Record<string, unknown>)[field] = value === 'true';
    } else if (typeof current === 'number') {
      (obj as Record<string, unknown>)[field] = Number(value);
    } else {
      (obj as Record<string, unknown>)[field] = value;
    }

    saveConfig(config);
    console.log(chalk.green(`Set ${key} = ${value}`));
  });

export { configCommand };
