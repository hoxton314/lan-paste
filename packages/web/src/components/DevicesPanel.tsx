import type { DeviceResponse } from '@lan-paste/shared';
import { getDeviceId } from '../lib/device.js';
import { platformIcon, timeAgo } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';

export function DevicesPanel({ devices, onClose }: { devices: DeviceResponse[]; onClose: () => void }) {
  const now = useNow();
  const self = getDeviceId();
  const sorted = [...devices].sort((a, b) => Number(b.online) - Number(a.online));

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-zinc-800 bg-zinc-900 p-2 shadow-xl">
        <div className="px-2 py-1 text-xs font-medium text-zinc-500">Devices</div>
        {sorted.length === 0 && <div className="px-2 py-3 text-sm text-zinc-500">No devices yet</div>}
        <ul className="max-h-80 overflow-y-auto">
          {sorted.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-800/60">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${d.online ? 'bg-emerald-400' : 'bg-zinc-600'}`}
                title={d.online ? 'Online' : 'Offline'}
              />
              <span title={d.platform}>{platformIcon(d.platform)}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-200">
                {d.name}
                {d.id === self && <span className="ml-1 text-xs text-zinc-500">(this)</span>}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {d.online ? 'online' : `${timeAgo(d.last_seen, now)} ago`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
