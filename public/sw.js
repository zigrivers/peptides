const CACHE_NAME = 'peptides-shell-v1';
// Only cache the offline fallback page — never cache authenticated routes.
const OFFLINE_URL = '/offline.html';

const DB_NAME = 'peptides-offline';
const STORE = 'dose-queue';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // API calls: never intercept.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests: network-first. Fall back to offline page.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets (_next/static): cache-first (fingerprinted URLs never change).
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) =>
        cached ?? fetch(event.request).then((res) => {
          if (res.ok) {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return res;
        })
      )
    );
    return;
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'dose-sync') {
    event.waitUntil(syncDoses());
  }
});

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

function getAllPending(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.filter((e) => !e.synced));
    req.onerror = () => reject(req.error);
  });
}

function markEntrySynced(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (!entry) { resolve(); return; }
      store.put({ ...entry, synced: true });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

async function syncDoses() {
  const db = await openOfflineDB();
  const pending = await getAllPending(db);
  if (!pending.length) return;

  const res = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries: pending }),
  });

  if (!res.ok) return;
  const { results } = await res.json();

  await Promise.all(
    results.filter((r) => r.ok).map((r) => markEntrySynced(db, r.id))
  );
}
