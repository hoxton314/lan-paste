import { getDeviceName } from '../lib/device.js';

export function Header() {
  return (
    <header className="flex items-center justify-between py-4">
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-zinc-100">LAN Paste</span>
      </div>
      <span className="text-xs text-zinc-500 rounded bg-zinc-800 px-2 py-1">
        {getDeviceName()}
      </span>
    </header>
  );
}
