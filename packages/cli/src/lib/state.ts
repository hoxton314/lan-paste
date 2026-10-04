import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Persistent daemon state (per device) — lets `watch` catch up on clips missed while offline */
export interface DaemonState {
  last_seen_at: string;
}

function stateDir(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share');
  return join(base, 'lan-paste');
}

export function statePath(deviceId: string): string {
  return join(stateDir(), `state-${deviceId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`);
}

export function loadState(deviceId: string): DaemonState | null {
  try {
    const parsed = JSON.parse(readFileSync(statePath(deviceId), 'utf8'));
    return typeof parsed?.last_seen_at === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveState(deviceId: string, state: DaemonState): void {
  const path = statePath(deviceId);
  mkdirSync(stateDir(), { recursive: true });
  // Write-then-rename so a crash never leaves a truncated state file
  writeFileSync(`${path}.tmp`, JSON.stringify(state));
  renameSync(`${path}.tmp`, path);
}
