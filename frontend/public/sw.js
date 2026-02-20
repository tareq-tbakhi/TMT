const CACHE_NAME = 'tmt-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API requests: network only (don't cache sensitive data)
  if (request.url.includes('/api/')) return;

  // WebSocket: skip
  if (request.url.includes('/ws/') || request.url.includes('socket.io')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Fallback to index.html for navigation requests (SPA)
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// Handle background sync for queued SOS requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sos') {
    event.waitUntil(syncPendingSOS());
  }
});

async function syncPendingSOS() {
  // Open IndexedDB and send any queued SOS requests
  try {
    const db = await openDB();
    const tx = db.transaction('pending_sos', 'readonly');
    const store = tx.objectStore('pending_sos');
    const requests = await getAllFromStore(store);

    for (const sos of requests) {
      try {
        // Get auth token from stored data or try to read from cache
        const token = sos.token || '';
        const response = await fetch('/api/v1/sos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            latitude: sos.latitude,
            longitude: sos.longitude,
            patient_status: sos.patientStatus,
            severity: sos.severity,
            details: sos.details,
          }),
        });

        if (response.ok) {
          // Remove from queue using messageId key
          const delTx = db.transaction('pending_sos', 'readwrite');
          delTx.objectStore('pending_sos').delete(sos.messageId);
        }
      } catch {
        // Still offline, will retry on next sync
      }
    }
  } catch {
    // IndexedDB not available
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    // Must match sosDispatcher.ts DB_NAME so both systems share the same queue
    const request = indexedDB.open('tmt-sos-queue', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_sos')) {
        db.createObjectStore('pending_sos', { keyPath: 'messageId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
