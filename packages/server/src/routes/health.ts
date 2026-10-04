import { Router } from 'express';
import type { HealthResponse } from '@lan-paste/shared';
import { getDb, getSchemaVersion } from '../db.js';
import { VERSION } from '../version.js';

export const healthRouter = Router();

const startTime = Date.now();

healthRouter.get('/', (_req, res) => {
  const db = getDb();
  const { count } = db.prepare('SELECT COUNT(*) as count FROM clips').get() as { count: number };

  const response: HealthResponse = {
    status: 'ok',
    version: VERSION,
    uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    clips_count: count,
    schema_version: getSchemaVersion(),
  };

  res.json(response);
});
