import type { LanPasteConfig } from '@lan-paste/shared';
import { loadConfig } from '../config.js';
import { ApiClient } from '../client.js';
import type { Identity } from '../client.js';
import { localPlatform } from './util.js';

export interface Context {
  config: LanPasteConfig;
  client: ApiClient;
  who: Identity;
}

export function getContext(opts: { server?: string; device?: string } = {}): Context {
  const config = loadConfig();
  return {
    config,
    client: new ApiClient(opts.server || config.server.url, config.server.api_key),
    who: {
      deviceId: config.device.id,
      deviceName: opts.device || config.device.name,
      platform: localPlatform(),
    },
  };
}
