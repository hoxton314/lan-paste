import { useState, useCallback, useRef } from 'react';
import { pushText, pushImage } from '../lib/api.js';

export function PushForm({ onPushed }: { onPushed: () => void }) {
  const [text, setText] = useState('');
  const [pushing, setPushing] = useState(false);
  const [toast, setToast] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handlePushText = useCallback(async () => {
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

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      // Try reading images from clipboard first
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          setPushing(true);
          const blob = await item.getType(imageType);
          const ext = imageType.split('/')[1] || 'png';
          const file = new File([blob], `clipboard.${ext}`, { type: imageType });
          await pushImage(file);
          showToast('Pushed image from clipboard!');
          onPushed();
          setPushing(false);
          return;
        }
      }
      // Fall back to text
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

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Only image files supported');
      return;
    }
    setPushing(true);
    try {
      await pushImage(file);
      showToast(`Pushed ${file.name}!`);
      onPushed();
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setPushing(false);
    }
  }, [onPushed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  }, [handleImageFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        return;
      }
    }
    // Let text paste happen normally in textarea
  }, [handleImageFile]);

  return (
    <div
      className={`space-y-3 rounded-lg border-2 border-dashed p-4 transition-colors ${
        dragOver ? 'border-zinc-400 bg-zinc-900/50' : 'border-transparent'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className="text-center text-sm text-zinc-400 py-4">
          Drop image here
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePushText(); }}
        onPaste={handlePaste}
        placeholder="Paste or type text... (drop images here)"
        rows={3}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none resize-none"
      />
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
          Upload Image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {toast && (
        <div className="text-sm text-zinc-400 animate-pulse">{toast}</div>
      )}
    </div>
  );
}
