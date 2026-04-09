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

export function ClipCard({
  clip,
  onDeleted,
  onImageClick,
}: {
  clip: ClipResponse;
  onDeleted: (id: string) => void;
  onImageClick?: (url: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const showCopied = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCopyText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clip.type === 'text' && clip.content) {
      try {
        await navigator.clipboard.writeText(clip.content);
      } catch {
        // Clipboard API unavailable in non-secure context (HTTP over LAN)
        // Fall back to execCommand
        const ta = document.createElement('textarea');
        ta.value = clip.content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showCopied();
    }
  };

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clip.type === 'image' && clip.image_url) {
      try {
        const res = await fetch(clip.image_url);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob }),
        ]);
        showCopied();
      } catch {
        // Clipboard API may not support images in non-secure context
        // Fall back to opening in lightbox
        if (onImageClick && clip.image_url) onImageClick(clip.image_url);
      }
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clip.image_url) {
      const a = document.createElement('a');
      a.href = clip.image_url;
      a.download = clip.filename || `clip-${clip.id}.png`;
      a.click();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    await deleteClip(clip.id);
    onDeleted(clip.id);
  };

  return (
    <div className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors">
      {clip.type === 'text' && clip.content && (
        <pre className="whitespace-pre-wrap break-words text-sm text-zinc-200 mb-3 max-h-40 overflow-hidden font-mono leading-relaxed">
          {clip.content.length > 500 ? clip.content.slice(0, 500) + '...' : clip.content}
        </pre>
      )}
      {clip.type === 'image' && clip.image_url && (
        <div className="mb-3">
          <img
            src={clip.image_url}
            alt={clip.filename || 'image'}
            className="max-h-48 rounded object-contain cursor-zoom-in"
            loading="lazy"
            onClick={(e) => {
              e.stopPropagation();
              if (onImageClick && clip.image_url) onImageClick(clip.image_url);
            }}
          />
          {clip.filename && (
            <span className="text-xs text-zinc-500 mt-1 block">{clip.filename}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{clip.device_name}</span>
          <span>{formatSize(clip.size_bytes)}</span>
          <span>{timeAgo(clip.created_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {copied && <span className="text-emerald-400 mr-1">Copied!</span>}

          {clip.type === 'text' && (
            <button
              onClick={handleCopyText}
              className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            >
              Copy
            </button>
          )}

          {clip.type === 'image' && (
            <>
              <button
                onClick={handleCopyImage}
                className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleDownload}
                className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                Download
              </button>
            </>
          )}

          <button
            onClick={handleDelete}
            className={`rounded px-2 py-0.5 hover:bg-zinc-800 transition-colors ${confirming ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            {confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
