/**
 * Centralized IndexedDB Management Service
 *
 * Single source of truth for IndexedDB operations.
 * Implements SOLID principles:
 * - SRP: Only handles database operations
 * - OCP: Extensible store configuration
 * - DIP: Abstract interface for testing
 *
 * @module services/offlineDB
 */

import { DB_CONFIG, DB_STORES, type PendingSOS, type SyncQueueItem } from '../types/cache';

// ─── Database Schema ─────────────────────────────────────────────

interface StoreConfig {
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }>;
}

const STORE_SCHEMAS: Record<string, StoreConfig> = {
  [DB_STORES.PENDING_SOS]: {
    keyPath: 'messageId',
    indexes: [
      { name: 'createdAt', keyPath: 'createdAt' },
      { name: 'retryCount', keyPath: 'retryCount' },
    ],
  },
  [DB_STORES.PROFILES]: {
    keyPath: 'id',
    indexes: [
      { name: 'cachedAt', keyPath: 'cachedAt' },
      { name: 'syncStatus', keyPath: 'syncStatus' },
      { name: 'expiresAt', keyPath: 'expiresAt' },
    ],
  },
  [DB_STORES.MEDICAL_RECORDS]: {
    keyPath: 'id',
    indexes: [
      { name: 'patientId', keyPath: 'patientId' },
      { name: 'cachedAt', keyPath: 'cachedAt' },
    ],
  },
  [DB_STORES.EMERGENCY_CONTACTS]: {
    keyPath: 'id',
    indexes: [
      { name: 'patientId', keyPath: 'patientId' },
      { name: 'cachedAt', keyPath: 'cachedAt' },
    ],
  },
  [DB_STORES.HOSPITALS]: {
    keyPath: 'id',
    indexes: [
      { name: 'cachedAt', keyPath: 'cachedAt' },
      { name: 'expiresAt', keyPath: 'expiresAt' },
    ],
  },
  [DB_STORES.SYNC_QUEUE]: {
    keyPath: 'id',
    indexes: [
      { name: 'entityType', keyPath: 'entityType' },
      { name: 'operation', keyPath: 'operation' },
      { name: 'createdAt', keyPath: 'createdAt' },
    ],
  },
};

// ─── Database Instance ───────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Open the IndexedDB database
 * Creates stores and indexes if they don't exist
 */
export async function openDatabase(): Promise<IDBDatabase> {
  // Return existing instance if available
  if (dbInstance) {
    return dbInstance;
  }

  // Return pending promise if already opening
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create all stores defined in schema
      for (const [storeName, config] of Object.entries(STORE_SCHEMAS)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement,
          });

          // Create indexes
          if (config.indexes) {
            for (const index of config.indexes) {
              store.createIndex(index.name, index.keyPath, index.options);
            }
          }
        }
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle database closing
      dbInstance.onclose = () => {
        dbInstance = null;
        dbPromise = null;
      };

      // Handle version change (another tab upgraded)
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
        dbPromise = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbPromise = null;
  }
}

// ─── Generic CRUD Operations ─────────────────────────────────────

/**
 * Get a single item from a store
 */
export async function getItem<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all items from a store
 */
export async function getAllItems<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get items by index
 */
export async function getItemsByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey
): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Put an item into a store (create or update)
 */
export async function putItem<T>(storeName: string, item: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Put multiple items into a store
 */
export async function putItems<T>(storeName: string, items: T[]): Promise<void> {
  if (items.length === 0) return;

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    for (const item of items) {
      store.put(item);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete an item from a store
 */
export async function deleteItem(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all items from a store
 */
export async function clearStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Count items in a store
 */
export async function countItems(storeName: string): Promise<number> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get items with expired cache
 */
export async function getExpiredItems<T extends { expiresAt: number }>(
  storeName: string
): Promise<T[]> {
  const db = await openDatabase();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('expiresAt');
    const range = IDBKeyRange.upperBound(now);
    const request = index.getAll(range);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete expired items from a store
 */
export async function deleteExpiredItems(storeName: string): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const index = store.index('expiresAt');
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);

    let deletedCount = 0;

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(deletedCount);
    tx.onerror = () => reject(tx.error);
  });
}

// ─── SOS Queue Operations ────────────────────────────────────────

/**
 * Add a pending SOS to the queue
 */
export async function addPendingSOS(sos: PendingSOS): Promise<void> {
  await putItem(DB_STORES.PENDING_SOS, sos);
}

/**
 * Get all pending SOS requests
 */
export async function getPendingSOS(): Promise<PendingSOS[]> {
  return getAllItems<PendingSOS>(DB_STORES.PENDING_SOS);
}

/**
 * Remove a pending SOS from the queue
 */
export async function removePendingSOS(messageId: string): Promise<void> {
  await deleteItem(DB_STORES.PENDING_SOS, messageId);
}

/**
 * Clear all pending SOS requests
 */
export async function clearPendingSOS(): Promise<void> {
  await clearStore(DB_STORES.PENDING_SOS);
}

/**
 * Update retry count for a pending SOS
 */
export async function updatePendingSOSRetry(
  messageId: string,
  error?: string
): Promise<void> {
  const sos = await getItem<PendingSOS>(DB_STORES.PENDING_SOS, messageId);
  if (sos) {
    sos.retryCount = (sos.retryCount || 0) + 1;
    sos.lastAttemptAt = Date.now();
    sos.lastError = error;
    await putItem(DB_STORES.PENDING_SOS, sos);
  }
}

// ─── Sync Queue Operations ───────────────────────────────────────

/**
 * Add an item to the sync queue
 */
export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  await putItem(DB_STORES.SYNC_QUEUE, item);
}

/**
 * Get all items in the sync queue
 */
export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  return getAllItems<SyncQueueItem>(DB_STORES.SYNC_QUEUE);
}

/**
 * Remove an item from the sync queue
 */
export async function removeFromSyncQueue(id: string): Promise<void> {
  await deleteItem(DB_STORES.SYNC_QUEUE, id);
}

/**
 * Update retry count for a sync queue item
 */
export async function updateSyncQueueRetry(
  id: string,
  error?: string
): Promise<void> {
  const item = await getItem<SyncQueueItem>(DB_STORES.SYNC_QUEUE, id);
  if (item) {
    item.retryCount = (item.retryCount || 0) + 1;
    item.lastAttemptAt = Date.now();
    item.lastError = error;
    await putItem(DB_STORES.SYNC_QUEUE, item);
  }
}

// ─── Utility Functions ───────────────────────────────────────────

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Delete the entire database (for testing/reset)
 */
export async function deleteDatabase(): Promise<void> {
  closeDatabase();

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_CONFIG.name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      console.warn('[OfflineDB] Database deletion blocked');
      resolve();
    };
  });
}

/**
 * Get database storage estimate
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
} | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentUsed: estimate.quota
        ? ((estimate.usage || 0) / estimate.quota) * 100
        : 0,
    };
  }
  return null;
}
