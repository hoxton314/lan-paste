import { useState, useCallback } from 'react';
import { pushText } from '../lib/api.js';

export function PushForm({ onPushed }: { onPushed: () => void }) {
  const [text, setText] = useState('');
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const handlePush = useCallback(async () => {
    if (!text.trim()) return;
    setPushing(true);
    try {
      await pushText(text);
      setText('');
      showToast('Pushed!');
      onPushed();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setPushing(false);
    }
  }, [text, onPushed]);

  const handlePaste = useCallback(async () => {
    try {
      const content = await navigator.clipboard.readText();
      if (!content.trim()) {
        showToast('Clipboard is empty');
        return;
      }
      setPushing(true);
      await pushText(content);
      showToast('Pushed from clipboard!');
      onPushed();
    } catch {
      showToast('Clipboard access denied');
    } finally {
      setPushing(false);
    }
  }, [onPushed]);

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePush(); }}
        placeholder="Paste or type text..."
        rows={3}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handlePush}
          disabled={pushing || !text.trim()}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pushing ? 'Pushing...' : 'Push'}
        </button>
        <button
          onClick={handlePaste}
          disabled={pushing}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition-colors"
        >
          Push from Clipboard
        </button>
      </div>
      {toast && (
        <div className="text-sm text-zinc-400 animate-pulse">{toast}</div>
      )}
    </div>
  );
}
