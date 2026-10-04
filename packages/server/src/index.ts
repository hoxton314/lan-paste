import 'dotenv/config';
import { env } from './env.js';
import { initDb } from './db.js';
import { startCleanup } from './cleanup.js';
import { createApp } from './app.js';
import { log } from './logger.js';
import { VERSION } from './version.js';

initDb();
startCleanup();

const app = createApp();

app.listen(env.LAN_PASTE_PORT, env.LAN_PASTE_HOST, () => {
  log.info(`lan-paste server v${VERSION} listening on ${env.LAN_PASTE_HOST}:${env.LAN_PASTE_PORT}`);
});
