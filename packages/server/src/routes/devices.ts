import { Router } from 'express';
import type { Device, DeviceListResponse } from '@lan-paste/shared';
import { getDb } from '../db.js';
import { getOnlineDeviceIds } from '../ws.js';

export const devicesRouter = Router();

// GET /api/devices — known devices with live online status, most recently seen first
devicesRouter.get('/', (_req, res) => {
  const devices = getDb().prepare('SELECT * FROM devices ORDER BY last_seen DESC').all() as Device[];
  const online = getOnlineDeviceIds();
  const response: DeviceListResponse = {
    devices: devices.map((d) => ({ ...d, online: online.has(d.id) })),
  };
  res.json(response);
});
