// LAN Paste service worker: offline app shell + Web Share Target.
// Never caches /api or /ws — clip data is always live.
const SHELL_CACHE = 'lan-paste-shell-v1';
const SHARE_CACHE = 'lan-paste-share';
const SHELL = ['/', '/manifest.json', '/icon.svg', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('lan-paste-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

function isLive(url) {
  return url.pathname.startsWith('/api') || url.pathname.startsWith('/ws');
}

// Web Share Target: stash the shared payload, then hand off to the app,
// which pushes it through the normal API (API key + E2E apply there).
async function handleShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    const files = [];
    let i = 0;
    for (const value of form.getAll('files')) {
      if (!(value instanceof File)) continue;
      const path = `/__share/file/${i++}`;
      await cache.put(path, new Response(value, { headers: { 'Content-Type': value.type || 'application/octet-stream' } }));
      files.push({ path, name: value.name || `shared-${i}`, type: value.type || 'application/octet-stream' });
    }
    const meta = {
      title: form.get('title') || undefined,
      text: form.get('text') || undefined,
      url: form.get('url') || undefined,
      files,
    };
    await cache.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // fall through to the app; it will find nothing to push
  }
  return Response.redirect('/?share=1', 303);
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    // Every navigation serves the SPA's index.html — keep the latest copy as the shell
    if (res.ok) cache.put('/', res.clone());
    return res;
  } catch {
    return (await cache.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(handleShare(request));
    return;
  }
  if (request.method !== 'GET' || isLive(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event));
});
