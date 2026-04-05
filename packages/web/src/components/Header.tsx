import { getDeviceName } from '../lib/device.js';

export function Header({ connected }: { connected: boolean }) {
  return (
    <header className="flex items-center justify-between py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-zinc-100">LAN Paste</span>
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
      </div>
      <span className="text-xs text-zinc-500 rounded bg-zinc-800 px-2 py-1">
        {getDeviceName()}
      </span>
    </header>
  );
}
