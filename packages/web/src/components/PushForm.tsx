import { useState, useCallback, useRef, useEffect } from 'react';
import type { ClipResponse, DeviceResponse } from '@lan-paste/shared';
import { getDeviceId } from '../lib/device.js';
import { useE2E } from '../lib/e2e.js';
import { ensureNamed, pushFileClip, pushTextClip } from '../lib/push.js';
import type { PushOpts } from '../lib/push.js';
import { takeSharedData } from '../lib/share.js';

const EXPIRY_OPTIONS: Array<{ label: string; seconds: number }> = [
  { label: 'Never', seconds: 0 },
  { label: '5 min', seconds: 5 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
];

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

const select =
  'rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:border-zinc-600 focus:outline-none';

export function PushForm({
  devices,
  onPushed,
}: {
  devices: DeviceResponse[];
  onPushed: (clip: ClipResponse) => void;
}) {
  const [text, setText] = useState('');
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [expiresIn, setExpiresIn] = useState(0);
  const [oneTime, setOneTime] = useState(false);
  const [target, setTarget] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { encrypt } = useE2E();

  const self = getDeviceId();
  const targets = devices.filter((d) => d.id !== self);

  const showToast = useCallback((msg: string, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ text: msg, error });
    toastTimer.current = setTimeout(() => setToast(null), error ? 4000 : 2500);
  }, []);

  const opts = useCallback((): PushOpts => ({
    expires_in: expiresIn || undefined,
    burn_after_read: oneTime || undefined,
    target_device_id: target || undefined,
  }), [expiresIn, oneTime, target]);

  const run = useCallback(async (label: string, fn: () => Promise<ClipResponse>) => {
    setPushing(true);
    try {
      onPushed(await fn());
      showToast(label);
      return true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Push failed', true);
      return false;
    } finally {
      setPushing(false);
    }
  }, [onPushed, showToast]);

  const pushTextValue = useCallback(
    (value: string, label = 'Pushed!') => run(label, () => pushTextClip(value, opts())),
    [run, opts],
  );

  const pushFiles = useCallback(async (files: File[]) => {
    for (const raw of files) {
      const file = ensureNamed(raw);
      await run(`Pushed ${file.name}`, () => pushFileClip(file, opts()));
    }
  }, [run, opts]);

  const handlePushText = useCallback(async () => {
    if (!text.trim()) return;
    if (await pushTextValue(text)) setText('');
  }, [text, pushTextValue]);

  const handlePasteFromClipboard = useCallback(async () => {
    if (!navigator.clipboard) {
      // undefined in non-secure contexts (plain HTTP over LAN)
      showToast('Clipboard API needs HTTPS — press Ctrl+V on the page instead', true);
      return;
    }
    try {
      // Try reading images first (clipboard.read is missing in some browsers)
      const items = navigator.clipboard.read ? await navigator.clipboard.read().catch(() => []) : [];
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          await pushFiles([new File([blob], '', { type: imageType })]);
          return;
        }
      }
      const content = await navigator.clipboard.readText();
      if (!content.trim()) {
        showToast('Clipboard is empty');
        return;
      }
      await pushTextValue(content, 'Pushed from clipboard!');
    } catch {
      showToast('Clipboard access denied', true);
    }
  }, [pushFiles, pushTextValue, showToast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      pushFiles(files);
      return;
    }
    const dropped = e.dataTransfer.getData('text/plain');
    if (dropped.trim()) pushTextValue(dropped);
  }, [pushFiles, pushTextValue]);

  // Pasting files/images into the textarea pushes them; text pastes normally
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      e.preventDefault();
      pushFiles(files);
    }
  }, [pushFiles]);

  // Global paste: Ctrl/Cmd+V anywhere outside a text field pushes immediately
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(document.activeElement) || !e.clipboardData) return;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        pushFiles(files);
        return;
      }
      const pasted = e.clipboardData.getData('text/plain');
      if (pasted.trim()) {
        e.preventDefault();
        pushTextValue(pasted, 'Pushed pasted text!');
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [pushFiles, pushTextValue]);

  // Web Share Target: the service worker redirects to /?share=1 after stashing the data
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('share')) return;
    history.replaceState(null, '', location.pathname);
    takeSharedData()
      .then(async (shared) => {
        if (!shared) return;
        if (shared.text.trim()) await run('Pushed shared text!', () => pushTextClip(shared.text));
        for (const file of shared.files) await run(`Pushed ${file.name}`, () => pushFileClip(ensureNamed(file)));
      })
      .catch(() => showToast('Could not read shared content', true));
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`space-y-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
        dragOver ? 'border-zinc-400 bg-zinc-900/50' : 'border-transparent'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        // Ignore leave events fired when moving over child elements
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="text-center text-sm text-zinc-400 py-4">
          Drop files here
        </div>
      )}
      <textarea
        name="content"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePushText(); }}
        onPaste={handlePaste}
        placeholder="Paste or type text… (drop files here, or Ctrl+V anywhere)"
        rows={3}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none resize-none"
      />

      {/* Push options */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-zinc-400">
        <label className="flex items-center gap-1.5">
          Expire
          <select className={select} value={expiresIn} onChange={(e) => setExpiresIn(Number(e.target.value))}>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.seconds} value={o.seconds}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Send to
          <select className={`${select} max-w-[10rem]`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">All devices</option>
            {targets.map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.online ? '' : ' (offline)'}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={oneTime} onChange={(e) => setOneTime(e.target.checked)} className="accent-orange-500" />
          🔥 One-time
        </label>
        {encrypt && <span className="text-violet-300" title="Pushes are end-to-end encrypted">🔒 Encrypted</span>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={handlePushText}
          disabled={pushing || !text.trim()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pushing ? 'Pushing...' : 'Push'}
        </button>
        <button
          onClick={handlePasteFromClipboard}
          disabled={pushing}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          Push from Clipboard
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={pushing}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          Upload File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) pushFiles(files);
            e.target.value = '';
          }}
        />
      </div>
      {toast && (
        <div className={`text-sm ${toast.error ? 'text-red-400' : 'text-zinc-400'}`}>{toast.text}</div>
      )}
    </div>
  );
}
