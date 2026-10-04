import { useEffect, useRef } from 'react';
import type { ClipResponse } from '@lan-paste/shared';
import type { ClipFilter } from '../hooks/useClips.js';
import { ClipCard } from './ClipCard.js';
import { SearchBar } from './SearchBar.js';

interface ClipListProps {
  clips: ClipResponse[];
  filter: ClipFilter;
  query: string;
  onFilterChange: (f: ClipFilter) => void;
  onQueryChange: (q: string) => void;
  deviceNames: Map<string, string>;
  onDeleted: (id: string) => void;
  onUpdated: (clip: ClipResponse) => void;
  onImageClick: (url: string) => void;
  onKeep: (id: string) => void;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  onLoadMore: () => void;
}

const tabs: Array<{ key: ClipFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'text', label: 'Text' },
  { key: 'image', label: 'Images' },
  { key: 'file', label: 'Files' },
];

export function ClipList(props: ClipListProps) {
  const { clips, filter, query, loading, loadingMore, hasMore, error, onLoadMore } = props;
  const sentinel = useRef<HTMLDivElement>(null);

  // Infinite scroll: load the next page when the sentinel nears the viewport
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && onLoadMore(),
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, clips.length]);

  return (
    <div className="space-y-3">
      <SearchBar onSearch={props.onQueryChange} />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">{query ? 'Search results' : 'Recent Clips'}</h2>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => props.onFilterChange(tab.key)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                filter === tab.key ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-sm text-red-400 text-center py-2">{error}</div>}

      {loading && clips.length === 0 && (
        <div className="text-sm text-zinc-500 text-center py-8">Loading...</div>
      )}

      {!loading && !error && clips.length === 0 && (
        <div className="text-sm text-zinc-500 text-center py-8">{query ? 'No matches' : 'No clips yet'}</div>
      )}

      <div className={`space-y-2 transition-opacity ${loading && clips.length > 0 ? 'opacity-60' : ''}`}>
        {clips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            deviceNames={props.deviceNames}
            onDeleted={props.onDeleted}
            onUpdated={props.onUpdated}
            onImageClick={props.onImageClick}
            onKeep={props.onKeep}
          />
        ))}
      </div>

      <div ref={sentinel} />
      {loadingMore && <div className="text-xs text-zinc-500 text-center py-3">Loading more…</div>}
      {!hasMore && clips.length > 20 && (
        <div className="text-xs text-zinc-600 text-center py-3">That's everything.</div>
      )}
    </div>
  );
}
