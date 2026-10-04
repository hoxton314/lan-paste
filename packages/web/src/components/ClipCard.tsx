import { useEffect, useMemo, useState } from 'react';
import type { ClipResponse } from '@lan-paste/shared';
import { decryptBytes, decryptText, DecryptError } from '@lan-paste/shared/crypto';
import { deleteClip, fetchBlob, patchClip, revealClip, withApiKey } from '../lib/api.js';
import { copyImage, copyText, downloadUrl } from '../lib/clipboard.js';
import { getDeviceId } from '../lib/device.js';
import { useE2E } from '../lib/e2e.js';
import { fileIcon, formatSize, timeAgo, timeUntil } from '../lib/format.js';
import { useNow } from '../hooks/useNow.js';
import { TextContent } from './TextContent.js';

type DecryptFailure = 'no_key' | 'wrong_key' | 'corrupt' | 'format';

function failureText(reason: DecryptFailure): string {
  if (reason === 'no_key') return 'Encrypted — set the passphrase in Settings';
  if (reason === 'wrong_key') return 'Encrypted with a different passphrase';
  return 'Encrypted content is corrupt';
}

function decryptFailure(err: unknown): DecryptFailure {
  return err instanceof DecryptError ? err.reason : 'corrupt';
}

const btn = 'rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors disabled:opacity-40';

export function ClipCard({
  clip,
  deviceNames,
  onDeleted,
  onUpdated,
  onImageClick,
  onKeep,
}: {
  clip: ClipResponse;
  deviceNames: Map<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (clip: ClipResponse) => void;
  onImageClick?: (url: string) => void;
  /** Keep this card even after the server deletes the clip (one-time reveal) */
  onKeep: (id: string) => void;
}) {
  const now = useNow();
  const { key, deriving } = useE2E();
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // One-time text: content returned by /reveal (still possibly encrypted)
  const [revealedText, setRevealedText] = useState<string | null>(null);
  // Binary we fetched ourselves (decrypted and/or one-time) → local object URL
  const [localBlob, setLocalBlob] = useState<{ blob: Blob; url: string } | null>(null);
  const [blobError, setBlobError] = useState<DecryptFailure | null>(null);
  const consumed = clip.burn_after_read && (revealedText !== null || localBlob !== null);

  const isMine = clip.device_id === getDeviceId();
  const forMe = clip.target_device_id === getDeviceId();
  const hasBinary = clip.type !== 'text';

  const showFlash = (text: string, error = false) => {
    setFlash({ text, error });
    setTimeout(() => setFlash(null), error ? 3500 : 1500);
  };

  // ── Text: plain, revealed one-time, and/or decrypted ──
  const rawText = clip.burn_after_read ? revealedText : clip.content;
  const text = useMemo<{ value?: string; error?: DecryptFailure } | null>(() => {
    if (clip.type !== 'text' || rawText == null) return null;
    if (!clip.encrypted) return { value: rawText };
    if (!key) return { error: 'no_key' };
    try {
      return { value: decryptText(rawText, key) };
    } catch (err) {
      return { error: decryptFailure(err) };
    }
  }, [clip.type, clip.encrypted, rawText, key]);

  // ── Encrypted (not one-time) binary: fetch + decrypt automatically for preview ──
  useEffect(() => {
    if (!hasBinary || !clip.encrypted || clip.burn_after_read || !clip.file_url) return;
    // Key changed: drop the preview decrypted with the previous key
    setLocalBlob(null);
    if (!key) {
      setBlobError('no_key');
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setBlobError(null);
    fetchBlob(clip.file_url)
      .then(async (blob) => {
        const plain = decryptBytes(new Uint8Array(await blob.arrayBuffer()), key);
        if (cancelled) return;
        const out = new Blob([plain as Uint8Array<ArrayBuffer>], { type: clip.mime_type });
        url = URL.createObjectURL(out);
        setLocalBlob({ blob: out, url });
      })
      .catch((err) => !cancelled && setBlobError(decryptFailure(err)));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hasBinary, clip.encrypted, clip.burn_after_read, clip.file_url, clip.mime_type, key]);

  // Revoke one-time object URLs on unmount
  useEffect(() => () => {
    if (localBlob && clip.burn_after_read) URL.revokeObjectURL(localBlob.url);
  }, [localBlob, clip.burn_after_read]);

  const filename = clip.filename || `clip-${clip.id}`;
  const previewUrl =
    clip.type !== 'image' ? null : localBlob ? localBlob.url : clip.image_url ? withApiKey(clip.image_url) : null;

  const handleReveal = async () => {
    setBusy(true);
    onKeep(clip.id);
    try {
      if (clip.type === 'text') {
        const res = await revealClip(clip.id);
        setRevealedText(res.content ?? '');
      } else if (clip.file_url) {
        const blob = await fetchBlob(clip.file_url);
        let out: Blob = blob;
        if (clip.encrypted) {
          if (!key) throw new Error(failureText('no_key'));
          out = new Blob(
            [decryptBytes(new Uint8Array(await blob.arrayBuffer()), key) as Uint8Array<ArrayBuffer>],
            { type: clip.mime_type },
          );
        } else {
          out = new Blob([blob], { type: clip.mime_type });
        }
        const url = URL.createObjectURL(out);
        setLocalBlob({ blob: out, url });
        if (clip.type === 'file') downloadUrl(url, filename);
      }
    } catch (err) {
      showFlash(err instanceof Error ? err.message : 'Reveal failed', true);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    try {
      if (clip.type === 'text') {
        if (!text?.value) return;
        await copyText(text.value);
      } else if (clip.type === 'image') {
        const blob = localBlob?.blob ?? (clip.image_url ? await fetchBlob(clip.image_url) : null);
        if (!blob) return;
        await copyImage(blob);
      }
      showFlash('Copied!');
    } catch {
      // Clipboard API may not support images in non-secure context — open the lightbox instead
      if (clip.type === 'image' && previewUrl && onImageClick) onImageClick(previewUrl);
      else showFlash('Copy failed', true);
    }
  };

  const handleDownload = () => {
    if (localBlob) downloadUrl(localBlob.url, filename);
    else if (clip.file_url) downloadUrl(withApiKey(clip.file_url), filename);
  };

  const handlePin = async () => {
    try {
      onUpdated(await patchClip(clip.id, { pinned: !clip.pinned }));
    } catch (err) {
      showFlash(err instanceof Error ? err.message : 'Update failed', true);
    }
  };

  const handleDelete = async () => {
    if (!confirming && !consumed) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    try {
      await deleteClip(clip.id);
      onDeleted(clip.id);
    } catch (err) {
      setConfirming(false);
      showFlash(err instanceof Error ? err.message : 'Delete failed', true);
    }
  };

  const border = forMe
    ? 'border-emerald-700/70 hover:border-emerald-600'
    : clip.pinned
      ? 'border-amber-800/60 hover:border-amber-700/70'
      : 'border-zinc-800 hover:border-zinc-700';

  const needsReveal = clip.burn_after_read && !consumed;
  const canCopy = clip.type === 'text' ? !!text?.value : clip.type === 'image' && !!previewUrl;
  const canDownload = hasBinary && (!clip.burn_after_read || !!localBlob) && (!clip.encrypted || !!localBlob);

  return (
    <div className={`rounded-lg border bg-zinc-900 p-4 transition-colors ${border}`}>
      {/* Badges */}
      {(clip.pinned || clip.encrypted || clip.burn_after_read || clip.target_device_id) && (
        <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
          {clip.pinned && <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-amber-300">📌 Pinned</span>}
          {clip.encrypted && <span className="rounded bg-violet-900/40 px-1.5 py-0.5 text-violet-300">🔒 E2E</span>}
          {clip.burn_after_read && <span className="rounded bg-orange-900/40 px-1.5 py-0.5 text-orange-300">🔥 One-time</span>}
          {clip.target_device_id && (
            <span className={`rounded px-1.5 py-0.5 ${forMe ? 'bg-emerald-900/50 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
              → {forMe ? 'this device' : deviceNames.get(clip.target_device_id) ?? clip.target_device_id.slice(0, 8)}
            </span>
          )}
        </div>
      )}

      {/* Body */}
      {needsReveal ? (
        <div className="mb-3 flex items-center gap-3">
          {hasBinary && <span className="text-2xl">{fileIcon(clip.mime_type)}</span>}
          <div className="min-w-0 flex-1 text-sm text-zinc-400">
            {hasBinary ? <span className="block truncate text-zinc-300">{filename}</span> : 'Hidden until revealed.'}
            <span className="text-xs text-zinc-500">It is deleted from the server once opened.</span>
          </div>
          <button
            onClick={handleReveal}
            disabled={busy}
            className="rounded-lg border border-orange-800/60 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-950/40 disabled:opacity-40"
          >
            {busy ? 'Opening…' : hasBinary ? '🔥 Download' : '🔥 Reveal'}
          </button>
        </div>
      ) : clip.type === 'text' ? (
        text?.value !== undefined ? (
          <TextContent text={text.value} />
        ) : text?.error ? (
          <div className="mb-3 text-sm text-violet-300/80">🔒 {deriving ? 'Deriving key…' : failureText(text.error)}</div>
        ) : null
      ) : clip.type === 'image' && previewUrl ? (
        <div className="mb-3">
          <img
            src={previewUrl}
            alt={filename}
            className="max-h-48 rounded object-contain cursor-zoom-in"
            loading="lazy"
            onClick={() => onImageClick?.(previewUrl)}
          />
          <span className="text-xs text-zinc-500 mt-1 block truncate">{filename}</span>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-2xl">{fileIcon(clip.mime_type)}</span>
          <div className="min-w-0">
            <span className="block truncate text-sm text-zinc-200">{filename}</span>
            <span className="text-xs text-zinc-500">{clip.mime_type}</span>
            {clip.encrypted && blobError && (
              <span className="block text-xs text-violet-300/80">🔒 {deriving ? 'Deriving key…' : failureText(blobError)}</span>
            )}
          </div>
        </div>
      )}

      {consumed && (
        <div className="mb-2 text-xs text-orange-300/70">Deleted from the server — only this view remains.</div>
      )}

      {/* Meta + actions */}
      <div className="flex flex-wrap items-center justify-between gap-y-1 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 ${isMine ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-800 text-zinc-400'}`}>
            {clip.device_name}
          </span>
          <span>{formatSize(clip.size_bytes)}</span>
          <span title={new Date(clip.created_at).toLocaleString()}>{timeAgo(clip.created_at, now)}</span>
          {clip.expires_at && (
            <span className="text-amber-400/80" title={new Date(clip.expires_at).toLocaleString()}>
              ⏳ {timeUntil(clip.expires_at, now)} left
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {flash && <span className={`mr-1 ${flash.error ? 'text-red-400' : 'text-emerald-400'}`}>{flash.text}</span>}
          {canCopy && <button onClick={handleCopy} className={btn}>Copy</button>}
          {canDownload && <button onClick={handleDownload} className={btn}>Download</button>}
          {!consumed && (
            <button onClick={handlePin} className={btn} title={clip.pinned ? 'Unpin' : 'Pin (keep forever)'}>
              {clip.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          <button
            onClick={handleDelete}
            className={`rounded px-2 py-0.5 hover:bg-zinc-800 transition-colors ${confirming ? 'text-red-400' : 'text-zinc-500 hover:text-zinc-200'}`}
          >
            {consumed ? 'Dismiss' : confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
