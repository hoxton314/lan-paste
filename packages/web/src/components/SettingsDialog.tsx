import { useEffect, useState } from 'react';
import { getApiKey, setApiKey } from '../lib/api.js';
import { setE2ESettings, useE2E } from '../lib/e2e.js';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const input =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none';

export function SettingsDialog({
  deviceName,
  onRename,
  onClose,
}: {
  deviceName: string;
  onRename: (name: string) => void;
  onClose: () => void;
}) {
  const e2e = useE2E();
  const [name, setName] = useState(deviceName);
  const [apiKey, setApiKeyValue] = useState(getApiKey());
  const [showApiKey, setShowApiKey] = useState(false);
  const [passphrase, setPassphrase] = useState(e2e.passphrase);
  const [showPass, setShowPass] = useState(false);
  const [encrypt, setEncrypt] = useState(e2e.encrypt);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    if (name.trim() && name.trim() !== deviceName) onRename(name.trim());
    const keyChanged = apiKey.trim() !== getApiKey();
    setApiKey(apiKey);
    setE2ESettings({ passphrase, encrypt: encrypt && !!passphrase });
    onClose();
    // WebSocket and image URLs embed the API key — simplest correct refresh is a reload
    if (keyChanged) location.reload();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-xl sm:rounded-xl border border-zinc-800 bg-zinc-900 p-5 space-y-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Settings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200" aria-label="Close">✕</button>
        </div>

        <section className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400" htmlFor="s-name">Device name</label>
          <input id="s-name" className={input} value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
        </section>

        <section className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-400" htmlFor="s-key">Server API key</label>
          <div className="flex gap-2">
            <input
              id="s-key"
              className={input}
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              placeholder="(none)"
              autoComplete="off"
              onChange={(e) => setApiKeyValue(e.target.value)}
            />
            <button onClick={() => setShowApiKey((v) => !v)} className="shrink-0 rounded-lg border border-zinc-700 px-2 text-xs text-zinc-400">
              {showApiKey ? 'Hide' : 'Show'}
            </button>
            {apiKey && (
              <button onClick={() => setApiKeyValue('')} className="shrink-0 rounded-lg border border-zinc-700 px-2 text-xs text-zinc-400">
                Clear
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500">Only needed when the server sets LAN_PASTE_API_KEY.</p>
        </section>

        <section className="space-y-2 rounded-lg border border-violet-900/40 bg-violet-950/10 p-3">
          <div className="text-xs font-medium text-violet-300">🔒 End-to-end encryption</div>
          <div className="flex gap-2">
            <input
              className={input}
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              placeholder="Shared passphrase"
              autoComplete="off"
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <button onClick={() => setShowPass((v) => !v)} className="shrink-0 rounded-lg border border-zinc-700 px-2 text-xs text-zinc-400">
              {showPass ? 'Hide' : 'Show'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={encrypt && !!passphrase}
              disabled={!passphrase}
              onChange={(e) => setEncrypt(e.target.checked)}
              className="accent-violet-500"
            />
            Encrypt my pushes
          </label>
          <p className="text-xs text-zinc-500">
            Use the same passphrase on every device (CLI: <code>encryption.passphrase</code>). The server only stores
            ciphertext; encrypted clips can't be searched. Stored in this browser only.
          </p>
          {e2e.passphrase && (
            <p className="text-xs text-zinc-500">
              {e2e.deriving ? 'Deriving key…' : e2e.key ? <>Key ID <code className="text-zinc-300">{hex(e2e.key.id)}</code> — must match on all devices</> : null}
            </p>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Cancel
          </button>
          <button onClick={save} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
