import { useCallback, useEffect, useState } from 'react';
import type { DeviceResponse } from '@lan-paste/shared';
import { fetchDevices } from '../lib/api.js';

export function useDevices() {
  const [devices, setDevices] = useState<DeviceResponse[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchDevices();
      setDevices(res.devices);
    } catch {
      // keep the last known list
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { devices, refresh };
}
