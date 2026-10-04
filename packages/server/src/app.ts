import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';
import multer from 'multer';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { env } from './env.js';
import { log } from './logger.js';
import { setupWebSocket } from './ws.js';
import { clipsRouter } from './routes/clips.js';
import { devicesRouter } from './routes/devices.js';
import { healthRouter } from './routes/health.js';
import { authMiddleware } from './middleware/auth.js';

export function createApp(opts: { webDir?: string | null } = {}): express.Application {
  const app = express();

  // WebSocket must be set up before other middleware
  setupWebSocket(app);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', authMiddleware);

  app.use('/api/clips', clipsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/health', healthRouter);

  // Unknown API routes → JSON 404 (instead of falling through to the SPA)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Turn body-size / upload errors into JSON instead of Express's HTML 500 page
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      res.status(status).json({ error: err.message });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    log.error('[server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  // Serve web UI static files in production
  const webDir = opts.webDir === undefined
    ? env.LAN_PASTE_WEB_DIR || resolve(import.meta.dirname, '../../web/dist')
    : opts.webDir;
  if (webDir && existsSync(webDir)) {
    app.use(express.static(webDir, {
      setHeaders: (res, path) => {
        // The service worker and its manifest must never be served stale
        if (path.endsWith('sw.js') || path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    // SPA fallback: serve index.html for non-API routes
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
    log.info(`Serving web UI from ${webDir}`);
  }

  return app;
}
