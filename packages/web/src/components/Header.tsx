import { useState } from 'react';
import type { DeviceResponse } from '@lan-paste/shared';
import { useE2E } from '../lib/e2e.js';
import { DevicesPanel } from './DevicesPanel.js';

export function Header({
  connected,
  devices,
  deviceName,
  onRename,
  onOpenSettings,
}: {
  connected: boolean;
  devices: DeviceResponse[];
  deviceName: string;
  onRename: (name: string) => void;
  onOpenSettings: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(deviceName);
  const [showDevices, setShowDevices] = useState(false);
  const { encrypt } = useE2E();
  const online = devices.filter((d) => d.online).length;

  const save = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== deviceName) onRename(trimmed);
    else setName(deviceName);
  };

  return (
    <header className="flex items-center justify-between gap-2 py-4">
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-zinc-100">LAN Paste</span>
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-600'}`}
          title={connected ? 'Connected' : 'Disconnected'}
        />
        {encrypt && <span className="text-xs" title="Your pushes are end-to-end encrypted">🔒</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <button
            onClick={() => setShowDevices((v) => !v)}
            className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            title="Devices"
          >
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" />
            {online} online
          </button>
          {showDevices && <DevicesPanel devices={devices} onClose={() => setShowDevices(false)} />}
        </div>
        {editing ? (
          <input
            autoFocus
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                setName(deviceName);
                setEditing(false);
              }
            }}
            className="w-32 rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setName(deviceName);
              setEditing(true);
            }}
            className="max-w-[9rem] truncate rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
            title="Rename this device"
          >
            {deviceName} ✎
          </button>
        )}
        <button
          onClick={onOpenSettings}
          className="rounded px-1.5 py-1 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          title="Settings"
          aria-label="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
