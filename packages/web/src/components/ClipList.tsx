import type { ClipResponse } from '@lan-paste/shared';
import { ClipCard } from './ClipCard.js';

interface ClipListProps {
  clips: ClipResponse[];
  filter: 'all' | 'text' | 'image';
  onFilterChange: (f: 'all' | 'text' | 'image') => void;
  onDeleted: (id: string) => void;
  loading: boolean;
}

export function ClipList({ clips, filter, onFilterChange, onDeleted, loading }: ClipListProps) {
  const filtered = filter === 'all' ? clips : clips.filter((c) => c.type === filter);
  const tabs: Array<{ key: 'all' | 'text' | 'image'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'text', label: 'Text' },
    { key: 'image', label: 'Images' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">Recent Clips</h2>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onFilterChange(tab.key)}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                filter === tab.key
                  ? 'bg-zinc-100 text-zinc-900'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && clips.length === 0 && (
        <div className="text-sm text-zinc-500 text-center py-8">Loading...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-zinc-500 text-center py-8">No clips yet</div>
      )}

      <div className="space-y-2">
        {filtered.map((clip) => (
          <ClipCard key={clip.id} clip={clip} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}
