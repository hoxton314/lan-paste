import { useState } from 'react';
import type { ClipResponse } from '@lan-paste/shared';
import { deleteClip } from '../lib/api.js';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function ClipCard({ clip, onDeleted }: { clip: ClipResponse; onDeleted: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleCopy = async () => {
    if (clip.type === 'text' && clip.content) {
      await navigator.clipboard.writeText(clip.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    await deleteClip(clip.id);
    onDeleted(clip.id);
  };

  return (
    <div
      onClick={handleCopy}
      className="group cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
    >
      {clip.type === 'text' && clip.content && (
        <pre className="whitespace-pre-wrap break-words text-sm text-zinc-200 mb-3 max-h-40 overflow-hidden font-mono leading-relaxed">
          {clip.content.length > 500 ? clip.content.slice(0, 500) + '...' : clip.content}
        </pre>
      )}
      {clip.type === 'image' && clip.image_url && (
        <img
          src={clip.image_url}
          alt={clip.filename || 'image'}
          className="max-h-48 rounded mb-3 object-contain"
          loading="lazy"
        />
      )}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{clip.device_name}</span>
          <span>{formatSize(clip.size_bytes)}</span>
          <span>{timeAgo(clip.created_at)}</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {copied && <span className="text-emerald-400">Copied!</span>}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className={`px-1.5 py-0.5 rounded hover:bg-zinc-800 ${confirming ? 'text-red-400' : 'text-zinc-500'}`}
          >
            {confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
