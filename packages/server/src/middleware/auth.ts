import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../env.js';

/** Extract the API key from `Authorization: Bearer ...` or `?api_key=...` */
export function getProvidedKey(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  const query = req.query.api_key;
  return typeof query === 'string' ? query : undefined;
}

export function isAuthorized(req: Request): boolean {
  const apiKey = env.LAN_PASTE_API_KEY;
  if (!apiKey) return true;

  const provided = getProvidedKey(req);
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(apiKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
