/**
 * TMT Service Worker
 *
 * Provides offline support for the TMT emergency response app:
 * - Static asset caching
 * - API response caching with strategies
 * - Background sync for SOS requests
 * - Profile data caching
 *
 * @version 2.0.0
 */

// ─── Constants ───────────────────────────────────────────────────

const CACHE_VERSION = 'v2';
const CACHE_NAME = `tmt-${CACHE_VERSION}`;
const API_CACHE_NAME = `tmt-api-${CACHE_VERSION}`;

// Database config - MUST match frontend/src/types/cache.ts
const DB_NAME = 'tmt-offline-db';
const DB_VERSION = 2;
const STORE_PENDING_SOS = 'pending_sos';
const STORE_SYNC_QUEUE = 'sync_queue';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// API caching configuration
const API_CACHE_CONFIG = {
  // Hospitals list - cache for 12 hours
  '/api/v1/hospitals': {
    strategy: 'stale-while-revalidate',
    maxAge: 12 * 60 * 60 * 1000,
  },
  // Alerts - cache for 5 minutes
  '/api/v1/alerts': {
    strategy: 'network-first',
    maxAge: 5 * 60 * 1000,
  },
  // Patient profile - cache for 24 hours
  '/api/v1/patients/': {
    strategy: 'stale-while-revalidate',
    maxAge: 24 * 60 * 60 * 1000,
  },
};

// ─── Install Event ───────────────────────────────────────────────

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch((error) => {
        console.warn('[SW] Some assets failed to cache:', error);
      });
    })
  );

  // Take control immediately
  self.skipWaiting();
});

// ─── Activate Event ──────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('tmt-') && key !== CACHE_NAME && key !== API_CACHE_NAME)
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      }),
      // Take control of all clients
      self.clients.claim(),
    ])
  );
});

// ─── Fetch Event ─────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests for caching
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket requests
  if (url.pathname.includes('/ws/') || url.pathname.includes('socket.io')) {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets and navigation
  event.respondWith(handleStaticRequest(request));
});

// ─── API Request Handler ─────────────────────────────────────────

async function handleApiRequest(request) {
  const url = new URL(request.url);

  // Find matching cache config
  const configKey = Object.keys(API_CACHE_CONFIG).find((key) => url.pathname.startsWith(key));
  const config = configKey ? API_CACHE_CONFIG[configKey] : null;

  // No caching config - network only
  if (!config) {
    return fetch(request);
  }

  // Apply caching strategy
  switch (config.strategy) {
    case 'stale-while-revalidate':
      return staleWhileRevalidate(request, config.maxAge);

    case 'network-first':
      return networkFirst(request, config.maxAge);

    default:
      return fetch(request);
  }
}

// ─── Cache Strategies ────────────────────────────────────────────

/**
 * Stale-While-Revalidate Strategy
 * Returns cached response immediately, then updates cache in background
 */
async function staleWhileRevalidate(request, maxAge) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Fetch fresh data in background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        // Clone and cache with timestamp
        const clonedResponse = response.clone();
        const headers = new Headers(clonedResponse.headers);
        headers.set('sw-cached-at', Date.now().toString());

        // Store in cache
        cache.put(request, new Response(clonedResponse.body, {
          status: clonedResponse.status,
          statusText: clonedResponse.statusText,
          headers,
        }));
      }
      return response;
    })
    .catch(() => {
      // Network failed, return cached if available
      return cachedResponse;
    });

  // Return cached response immediately if valid
  if (cachedResponse) {
    const cachedAt = parseInt(cachedResponse.headers.get('sw-cached-at') || '0');
    const isValid = Date.now() - cachedAt < maxAge;

    if (isValid) {
      return cachedResponse;
    }
  }

  // Wait for network if no valid cache
  return fetchPromise;
}

/**
 * Network-First Strategy
 * Tries network first, falls back to cache
 */
async function networkFirst(request, maxAge) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      const headers = new Headers(response.headers);
      headers.set('sw-cached-at', Date.now().toString());

      cache.put(request, new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      const cachedAt = parseInt(cachedResponse.headers.get('sw-cached-at') || '0');
      const isValid = Date.now() - cachedAt < maxAge;

      if (isValid) {
        return cachedResponse;
      }
    }

    // No valid cache
    throw error;
  }
}

// ─── Static Request Handler ──────────────────────────────────────

async function handleStaticRequest(request) {
  try {
    // Try network first for static assets
    const response = await fetch(request);

    if (response.ok) {
      // Cache successful responses
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request);

    if (cached) {
      return cached;
    }

    // For navigation requests, return index.html (SPA fallback)
    if (request.mode === 'navigate') {
      const index = await caches.match('/index.html');
      if (index) {
        return index;
      }
    }

    // Return offline page or error
    return new Response('Offline - No cached version available', {
      status: 503,
      statusText: 'Service Unavailable',
    });
  }
}

// ─── Background Sync ─────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);

  switch (event.tag) {
    case 'sync-sos':
      event.waitUntil(syncPendingSOS());
      break;

    case 'sync-profile':
      event.waitUntil(syncPendingProfiles());
      break;

    default:
      console.log('[SW] Unknown sync tag:', event.tag);
  }
});

/**
 * Sync pending SOS requests
 */
async function syncPendingSOS() {
  console.log('[SW] Syncing pending SOS...');

  try {
    const db = await openDB();
    const pendingSOS = await getAllFromStore(db, STORE_PENDING_SOS);

    console.log(`[SW] Found ${pendingSOS.length} pending SOS`);

    for (const sos of pendingSOS) {
      try {
        // Get auth token from stored user
        const token = await getAuthToken();

        if (!token) {
          console.warn('[SW] No auth token available for sync');
          continue;
        }

        const response = await fetch('/api/v1/sos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            latitude: sos.latitude,
            longitude: sos.longitude,
            patient_status: sos.patientStatus,
            severity: sos.severity,
            details: sos.details,
            triage_transcript: sos.triage_transcript,
          }),
        });

        if (response.ok) {
          // Remove from queue
          await deleteFromStore(db, STORE_PENDING_SOS, sos.messageId);
          console.log(`[SW] Synced SOS: ${sos.messageId}`);

          // Notify clients
          await notifyClients({
            type: 'SOS_SYNCED',
            messageId: sos.messageId,
          });
        } else {
          console.warn(`[SW] Failed to sync SOS ${sos.messageId}:`, response.status);
          await updateRetryCount(db, STORE_PENDING_SOS, sos.messageId);
        }
      } catch (error) {
        console.error(`[SW] Error syncing SOS ${sos.messageId}:`, error);
        await updateRetryCount(db, STORE_PENDING_SOS, sos.messageId);
      }
    }
  } catch (error) {
    console.error('[SW] Sync SOS error:', error);
  }
}

/**
 * Sync pending profile updates
 */
async function syncPendingProfiles() {
  console.log('[SW] Syncing pending profile updates...');

  try {
    const db = await openDB();
    const syncQueue = await getAllFromStore(db, STORE_SYNC_QUEUE);

    const profileSyncs = syncQueue.filter((item) => item.entityType === 'profile');
    console.log(`[SW] Found ${profileSyncs.length} pending profile syncs`);

    for (const item of profileSyncs) {
      try {
        const token = await getAuthToken();

        if (!token) {
          console.warn('[SW] No auth token available for sync');
          continue;
        }

        if (item.operation === 'update' && item.data) {
          const response = await fetch(`/api/v1/patients/${item.entityId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(item.data),
          });

          if (response.ok) {
            await deleteFromStore(db, STORE_SYNC_QUEUE, item.id);
            console.log(`[SW] Synced profile update: ${item.entityId}`);

            await notifyClients({
              type: 'PROFILE_SYNCED',
              entityId: item.entityId,
            });
          }
        }
      } catch (error) {
        console.error(`[SW] Error syncing profile ${item.entityId}:`, error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync profiles error:', error);
  }
}

// ─── Push Notifications ──────────────────────────────────────────

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  let data = { title: 'TMT Alert', body: 'New notification' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'tmt-notification',
    data: data,
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');

  event.notification.close();

  const data = event.notification.data || {};
  const url = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

// ─── IndexedDB Helpers ───────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create stores if they don't exist
      if (!db.objectStoreNames.contains(STORE_PENDING_SOS)) {
        const sosStore = db.createObjectStore(STORE_PENDING_SOS, { keyPath: 'messageId' });
        sosStore.createIndex('createdAt', 'createdAt');
        sosStore.createIndex('retryCount', 'retryCount');
      }

      if (!db.objectStoreNames.contains(STORE_SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORE_SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('entityType', 'entityType');
        syncStore.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteFromStore(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function updateRetryCount(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => {
      const item = request.result;
      if (item) {
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastAttemptAt = Date.now();
        store.put(item);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Auth Token Helper ───────────────────────────────────────────

async function getAuthToken() {
  // Try to get token from clients
  const clients = await self.clients.matchAll();

  for (const client of clients) {
    try {
      // Request token from client
      const channel = new MessageChannel();

      const tokenPromise = new Promise((resolve) => {
        channel.port1.onmessage = (event) => {
          resolve(event.data.token);
        };

        // Timeout after 1 second
        setTimeout(() => resolve(null), 1000);
      });

      client.postMessage({ type: 'GET_AUTH_TOKEN' }, [channel.port2]);

      const token = await tokenPromise;
      if (token) return token;
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Client Communication ────────────────────────────────────────

async function notifyClients(message) {
  const clients = await self.clients.matchAll();

  for (const client of clients) {
    client.postMessage(message);
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_CACHE_STATUS':
      event.ports[0]?.postMessage({
        caches: [CACHE_NAME, API_CACHE_NAME],
        version: CACHE_VERSION,
      });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        caches.delete(API_CACHE_NAME).then(() => {
          event.ports[0]?.postMessage({ cleared: true });
        });
      });
      break;
  }
});

console.log('[SW] Service worker loaded');
