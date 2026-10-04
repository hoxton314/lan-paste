import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClipResponse, ClipType } from '@lan-paste/shared';
import { fetchClips } from '../lib/api.js';

export type ClipFilter = 'all' | ClipType;

const PAGE_SIZE = 50;
const MAX_PINNED = 200;

function byNewest(a: ClipResponse, b: ClipResponse): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

/** Client-side mirror of the server filters, for clips arriving live over WebSocket */
function matches(clip: ClipResponse, filter: ClipFilter, query: string): boolean {
  if (filter !== 'all' && clip.type !== filter) return false;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  if (clip.encrypted) return false;
  const hay = `${clip.content ?? ''} ${clip.filename ?? ''}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/**
 * Paginated clip history.
 *
 * Server order is `pinned DESC, created_at DESC`, which breaks a plain created_at cursor.
 * So pinned clips are fetched once on their own, and the main list pages through
 * *unpinned* clips: `before=<oldest loaded>` plus `offset=<pinned clips older than it>`
 * skips exactly the pinned rows the server sorts first.
 */
export function useClips(filter: ClipFilter, query: string) {
  const [pinned, setPinned] = useState<ClipResponse[]>([]);
  const [items, setItems] = useState<ClipResponse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const generation = useRef(0);
  const state = useRef({ pinned, items, hasMore, loadingMore, filter, query });
  state.current = { pinned, items, hasMore, loadingMore, filter, query };

  const baseQuery = useCallback(() => ({
    type: filter === 'all' ? undefined : filter,
    q: query.trim() || undefined,
  }), [filter, query]);

  const reload = useCallback(async () => {
    const gen = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const base = baseQuery();
      const pinnedRes = await fetchClips({ ...base, pinned: true, limit: MAX_PINNED });
      const page = await fetchClips({ ...base, limit: PAGE_SIZE, offset: pinnedRes.total });
      if (gen !== generation.current) return; // superseded by a newer filter/search
      setPinned(pinnedRes.clips);
      setItems(page.clips.filter((c) => !c.pinned));
      setHasMore(page.clips.length === PAGE_SIZE);
    } catch (err) {
      if (gen === generation.current) setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [baseQuery]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadMore = useCallback(async () => {
    const s = state.current;
    if (!s.hasMore || s.loadingMore || s.items.length === 0) return;
    const gen = generation.current;
    const cursor = s.items[s.items.length - 1].created_at;
    const pinnedOlder = s.pinned.filter((c) => c.created_at < cursor).length;
    setLoadingMore(true);
    try {
      const page = await fetchClips({ ...baseQuery(), limit: PAGE_SIZE, before: cursor, offset: pinnedOlder });
      if (gen !== generation.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...page.clips.filter((c) => !c.pinned && !seen.has(c.id))];
      });
      setHasMore(page.clips.length === PAGE_SIZE);
    } catch (err) {
      if (gen === generation.current) setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoadingMore(false);
    }
  }, [baseQuery]);

  const remove = useCallback((id: string) => {
    setPinned((prev) => prev.filter((c) => c.id !== id));
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /** Insert or move a clip (new, pushed by us, or updated e.g. pin toggled) */
  const upsert = useCallback((clip: ClipResponse) => {
    const { filter: f, query: q } = state.current;
    setPinned((prev) => {
      const rest = prev.filter((c) => c.id !== clip.id);
      return clip.pinned && matches(clip, f, q) ? [...rest, clip].sort(byNewest) : rest;
    });
    setItems((prev) => {
      const rest = prev.filter((c) => c.id !== clip.id);
      if (clip.pinned || !matches(clip, f, q)) return rest;
      const oldest = rest[rest.length - 1];
      // Older than everything loaded: it'll arrive with a later page instead
      if (oldest && state.current.hasMore && clip.created_at < oldest.created_at) return rest;
      return [...rest, clip].sort(byNewest);
    });
  }, []);

  return {
    clips: [...pinned, ...items],
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    upsert,
    remove,
  };
}
