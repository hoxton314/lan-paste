import { useState, useEffect, useCallback } from 'react';
import type { ClipResponse } from '@lan-paste/shared';
import { fetchClips } from './lib/api.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { Header } from './components/Header.js';
import { PushForm } from './components/PushForm.js';
import { ClipList } from './components/ClipList.js';

export function App() {
  const [clips, setClips] = useState<ClipResponse[]>([]);
  const [filter, setFilter] = useState<'all' | 'text' | 'image'>('all');
  const [loading, setLoading] = useState(true);

  const loadClips = useCallback(async () => {
    try {
      const data = await fetchClips(100);
      setClips(data.clips);
    } catch {
      // will retry via websocket reconnect or manual refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadClips(); }, [loadClips]);

  const handleNewClip = useCallback((msg: { clip: ClipResponse }) => {
    setClips((prev) => [msg.clip, ...prev.filter((c) => c.id !== msg.clip.id)]);
  }, []);

  const handleClipDeleted = useCallback((msg: { clip_id: string }) => {
    setClips((prev) => prev.filter((c) => c.id !== msg.clip_id));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  useWebSocket({ onNewClip: handleNewClip, onClipDeleted: handleClipDeleted });

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12">
      <Header />
      <div className="space-y-6">
        <PushForm onPushed={loadClips} />
        <ClipList
          clips={clips}
          filter={filter}
          onFilterChange={setFilter}
          onDeleted={handleDeleted}
          loading={loading}
        />
      </div>
    </div>
  );
}
