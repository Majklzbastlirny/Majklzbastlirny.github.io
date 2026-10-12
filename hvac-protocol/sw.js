// Service worker: makes the app work offline (depot without signal).
//
// All app files live in one complete cache and are served from it. On every
// launch the page asks for an update check: each file is re-fetched (cheap
// 304s when unchanged) and if anything differs a complete new cache is built
// and swapped in, then the page shows "new version - reload". A half-finished
// download never replaces a working version, and there is no version number
// to bump on deploy.
//
// Protocol data is NOT here - it lives in IndexedDB (js/store.js).
// When you add a file to the app, add it to FILES.

const FILES = [
  './',
  'style.css',
  'manifest.webmanifest',
  'steps.toml',
  'i18n/en.toml',
  'i18n/cs.toml',
  'js/app.js',
  'js/model.js',
  'js/i18n.js',
  'js/store.js',
  'js/pdf.js',
  'js/ui.js',
  'vendor/smol-toml.js',
  'vendor/jspdf.umd.min.js',
  'fonts/Carlito-Regular.ttf',
  'fonts/Carlito-Bold.ttf',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.png',
];
const PREFIX = 'hvac-app-';
const COMPLETE = '__complete__';

let activeName = null;

async function findActive() {
  if (activeName) return activeName;
  const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX)).sort().reverse();
  for (const name of names) {
    if (await (await caches.open(name)).match(COMPLETE)) {
      activeName = name;
      return name;
    }
  }
  return null;
}

// Redirected responses can't answer navigations; store a clean copy.
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function fetchAll() {
  return Promise.all(FILES.map(async (file) => {
    const res = await fetch(new Request(file, { cache: 'no-cache' }));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    return [file, await clean(res)];
  }));
}

async function install(responses) {
  const name = `${PREFIX}${Date.now()}`;
  const cache = await caches.open(name);
  await Promise.all(responses.map(([file, res]) => cache.put(file, res)));
  await cache.put(COMPLETE, new Response('ok'));
  activeName = name;
  for (const n of await caches.keys()) {
    if (n.startsWith(PREFIX) && n !== name) await caches.delete(n);
  }
}

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

async function checkForUpdate() {
  let responses;
  try {
    responses = await fetchAll();
  } catch {
    return; // offline or a file failed: keep the current version
  }
  const name = await findActive();
  if (name) {
    const cache = await caches.open(name);
    let changed = false;
    for (const [file, res] of responses) {
      const old = await cache.match(file);
      if (!old || !sameBytes(await old.arrayBuffer(), await res.clone().arrayBuffer())) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
  }
  await install(responses);
  for (const client of await self.clients.matchAll({ type: 'window' })) {
    client.postMessage({ type: 'update-ready' });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(fetchAll().then(install).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'check-update') event.waitUntil(checkForUpdate());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const name = await findActive();
    if (name) {
      const cache = await caches.open(name);
      const hit = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
      if (hit) return hit;
    }
    return fetch(req);
  })());
});
