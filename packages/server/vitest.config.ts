import { defineConfig } from 'vitest/config';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const storage = mkdtempSync(join(tmpdir(), 'lan-paste-test-'));

export default defineConfig({
  test: {
    env: {
      LAN_PASTE_DB_PATH: ':memory:',
      LAN_PASTE_STORAGE_DIR: storage,
      LAN_PASTE_MAX_CLIP_SIZE_MB: '1',
      LAN_PASTE_LOG_LEVEL: 'warn',
      LAN_PASTE_API_KEY: '',
    },
  },
});
