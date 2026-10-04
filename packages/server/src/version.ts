import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Works from both src/ (tsx) and dist/ (built): package.json is one level up
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const VERSION = readVersion();
