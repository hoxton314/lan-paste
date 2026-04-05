import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './env.js';
import { initDb } from './db.js';
import { startCleanup } from './cleanup.js';
import { setupWebSocket } from './ws.js';
import { clipsRouter } from './routes/clips.js';
import { healthRouter } from './routes/health.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

// WebSocket must be set up before other middleware
setupWebSocket(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', authMiddleware);

app.use('/api/clips', clipsRouter);
app.use('/api/health', healthRouter);

// Serve web UI static files in production
const webDir = env.LAN_PASTE_WEB_DIR || resolve(import.meta.dirname, '../../web/dist');
if (existsSync(webDir)) {
  app.use(express.static(webDir));
  // SPA fallback: serve index.html for non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(webDir, 'index.html'));
  });
  console.log(`Serving web UI from ${webDir}`);
}

initDb();
startCleanup();

app.listen(env.LAN_PASTE_PORT, env.LAN_PASTE_HOST, () => {
  console.log(`lan-paste server listening on ${env.LAN_PASTE_HOST}:${env.LAN_PASTE_PORT}`);
});
