import { z } from 'zod';

const envSchema = z.object({
  LAN_PASTE_PORT: z.coerce.number().default(3456),
  LAN_PASTE_HOST: z.string().default('0.0.0.0'),
  LAN_PASTE_DB_PATH: z.string().default('./data/lan-paste.db'),
  LAN_PASTE_STORAGE_DIR: z.string().default('./data/storage'),
  LAN_PASTE_RETENTION_DAYS: z.coerce.number().default(7),
  LAN_PASTE_MAX_CLIP_SIZE_MB: z.coerce.number().default(10),
  LAN_PASTE_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LAN_PASTE_API_KEY: z.string().default(''),
  LAN_PASTE_WEB_DIR: z.string().default(''),
});

export const env = envSchema.parse(process.env);
