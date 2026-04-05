import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = env.LAN_PASTE_API_KEY;
  if (!apiKey) {
    next();
    return;
  }

  const provided =
    req.headers.authorization?.replace('Bearer ', '') ||
    (req.query.api_key as string | undefined);

  if (provided !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
