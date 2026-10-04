import { env } from './env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LAN_PASTE_LOG_LEVEL];

function emit(level: Level, args: unknown[]): void {
  if (LEVELS[level] < threshold) return;
  const line = [new Date().toISOString(), level.toUpperCase().padEnd(5), ...args];
  if (level === 'error') console.error(...line);
  else if (level === 'warn') console.warn(...line);
  else console.log(...line);
}

export const log = {
  debug: (...args: unknown[]) => emit('debug', args),
  info: (...args: unknown[]) => emit('info', args),
  warn: (...args: unknown[]) => emit('warn', args),
  error: (...args: unknown[]) => emit('error', args),
};
