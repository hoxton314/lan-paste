import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { initDb } from './db.js';
import { startCleanup } from './cleanup.js';
import { clipsRouter } from './routes/clips.js';
import { healthRouter } from './routes/health.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', authMiddleware);

app.use('/api/clips', clipsRouter);
app.use('/api/health', healthRouter);

initDb();
startCleanup();

app.listen(env.LAN_PASTE_PORT, env.LAN_PASTE_HOST, () => {
  console.log(`lan-paste server listening on ${env.LAN_PASTE_HOST}:${env.LAN_PASTE_PORT}`);
});
