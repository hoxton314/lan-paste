import { useState, useCallback, useMemo, useRef } from 'react';
import type { ClipResponse } from '@lan-paste/shared';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useClips } from './hooks/useClips.js';
import type { ClipFilter } from './hooks/useClips.js';
import { useDevices } from './hooks/useDevices.js';
import { getDeviceName, setDeviceName } from './lib/device.js';
import { Header } from './components/Header.js';
import { PushForm } from './components/PushForm.js';
import { ClipList } from './components/ClipList.js';
import { ImagePreview } from './components/ImagePreview.js';
import { SettingsDialog } from './components/SettingsDialog.js';

export function App() {
  const [filter, setFilter] = useState<ClipFilter>('all');
  const [query, setQuery] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deviceName, setDeviceNameState] = useState(getDeviceName());

  const clips = useClips(filter, query);
  const { devices, refresh: refreshDevices } = useDevices();

  // One-time clips being viewed locally: keep their cards when the server deletes them
  const kept = useRef(new Set<string>());
  const keep = useCallback((id: string) => kept.current.add(id), []);

  const handleDeleted = useCallback((id: string) => {
    kept.current.delete(id);
    clips.remove(id);
  }, [clips.remove]);

  const resync = useCallback(() => {
    clips.reload();
    refreshDevices();
  }, [clips.reload, refreshDevices]);

  const { connected, reidentify } = useWebSocket({
    onNewClip: (msg) => clips.upsert(msg.clip),
    onClipUpdated: (msg) => clips.upsert(msg.clip),
    onClipDeleted: (msg) => {
      if (!kept.current.has(msg.clip_id)) clips.remove(msg.clip_id);
    },
    onDevicesChanged: refreshDevices,
    onReconnect: resync,
  });

  const rename = useCallback((name: string) => {
    setDeviceName(name);
    setDeviceNameState(getDeviceName());
    reidentify();
  }, [reidentify]);

  const deviceNames = useMemo(() => new Map(devices.map((d) => [d.id, d.name])), [devices]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12">
      <Header
        connected={connected}
        devices={devices}
        deviceName={deviceName}
        onRename={rename}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="space-y-6">
        <PushForm devices={devices} onPushed={clips.upsert} />
        <ClipList
          clips={clips.clips}
          filter={filter}
          query={query}
          onFilterChange={setFilter}
          onQueryChange={setQuery}
          deviceNames={deviceNames}
          onDeleted={handleDeleted}
          onUpdated={clips.upsert}
          onImageClick={setPreviewUrl}
          onKeep={keep}
          loading={clips.loading}
          loadingMore={clips.loadingMore}
          hasMore={clips.hasMore}
          error={clips.error}
          onLoadMore={clips.loadMore}
        />
      </div>
      {previewUrl && <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />}
      {settingsOpen && (
        <SettingsDialog deviceName={deviceName} onRename={rename} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
