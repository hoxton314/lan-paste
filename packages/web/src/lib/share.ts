// Data stashed by the service worker when the PWA is used as a Web Share Target (see public/sw.js)
const SHARE_CACHE = 'lan-paste-share';
const META_PATH = '/__share/meta';

interface ShareMeta {
  title?: string;
  text?: string;
  url?: string;
  files: Array<{ path: string; name: string; type: string }>;
}

export interface SharedData {
  text: string;
  files: File[];
}

/** Read and clear pending shared data. Returns null when there is none. */
export async function takeSharedData(): Promise<SharedData | null> {
  if (!('caches' in window)) return null;
  const cache = await caches.open(SHARE_CACHE);
  const metaRes = await cache.match(META_PATH);
  if (!metaRes) return null;

  const meta = (await metaRes.json()) as ShareMeta;
  const files: File[] = [];
  for (const f of meta.files) {
    const res = await cache.match(f.path);
    if (res) files.push(new File([await res.blob()], f.name, { type: f.type }));
  }
  await caches.delete(SHARE_CACHE);

  // Apps put links in `text` and/or `url` — avoid pushing the same URL twice
  const parts = [meta.title, meta.text].filter((p): p is string => !!p?.trim());
  if (meta.url && !parts.some((p) => p.includes(meta.url!))) parts.push(meta.url);
  return { text: parts.join('\n'), files };
}
