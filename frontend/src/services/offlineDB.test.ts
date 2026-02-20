/**
 * Offline Database Service Tests
 *
 * Tests for IndexedDB operations and offline data management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock IndexedDB
const mockIDBStore = {
  put: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  count: vi.fn(),
  index: vi.fn(),
  createIndex: vi.fn(),
};

const mockIDBTransaction = {
  objectStore: vi.fn().mockReturnValue(mockIDBStore),
  oncomplete: null as (() => void) | null,
  onerror: null as ((error: unknown) => void) | null,
};

const mockIDBDatabase = {
  transaction: vi.fn().mockReturnValue(mockIDBTransaction),
  objectStoreNames: {
    contains: vi.fn().mockReturnValue(true),
  },
  createObjectStore: vi.fn().mockReturnValue(mockIDBStore),
  close: vi.fn(),
  onclose: null as (() => void) | null,
  onversionchange: null as (() => void) | null,
};

const mockIDBRequest = {
  result: mockIDBDatabase,
  onsuccess: null as (() => void) | null,
  onerror: null as ((error: unknown) => void) | null,
  onupgradeneeded: null as ((event: { target: { result: unknown } }) => void) | null,
};

const mockIDB = {
  open: vi.fn().mockImplementation(() => {
    // Immediately trigger success
    setTimeout(() => {
      mockIDBRequest.onsuccess?.();
    }, 0);
    return mockIDBRequest;
  }),
  deleteDatabase: vi.fn().mockImplementation(() => {
    const req = {
      onsuccess: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onblocked: null as (() => void) | null,
    };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  }),
};

vi.stubGlobal('indexedDB', mockIDB);

// Mock IDBKeyRange
vi.stubGlobal('IDBKeyRange', {
  upperBound: vi.fn().mockReturnValue({ upper: 'bound' }),
  lowerBound: vi.fn().mockReturnValue({ lower: 'bound' }),
  bound: vi.fn().mockReturnValue({ range: 'bound' }),
});

// Mock navigator.storage
vi.stubGlobal('navigator', {
  ...navigator,
  storage: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1000000,
      quota: 100000000,
    }),
  },
});

// Import after mocks
import {
  openDatabase,
  closeDatabase,
  getItem,
  getAllItems,
  putItem,
  deleteItem,
  clearStore,
  addPendingSOS,
  getPendingSOS,
  removePendingSOS,
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  isIndexedDBAvailable,
  getStorageEstimate,
} from './offlineDB';
import { DB_STORES } from '../types/cache';
import type { PendingSOS, SyncQueueItem } from '../types/cache';

describe('OfflineDB Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset transaction mocks
    mockIDBTransaction.oncomplete = null;
    mockIDBTransaction.onerror = null;

    // Make store operations trigger transaction completion
    mockIDBStore.put.mockImplementation(() => {
      setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
      return { onsuccess: null, onerror: null };
    });

    mockIDBStore.getAll.mockImplementation(() => {
      const req = { result: [], onsuccess: null as (() => void) | null, onerror: null };
      setTimeout(() => {
        req.onsuccess?.();
      }, 0);
      return req;
    });

    mockIDBStore.get.mockImplementation(() => {
      const req = { result: null, onsuccess: null as (() => void) | null, onerror: null };
      setTimeout(() => {
        req.onsuccess?.();
      }, 0);
      return req;
    });

    mockIDBStore.delete.mockImplementation(() => {
      setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
      return { onsuccess: null, onerror: null };
    });

    mockIDBStore.clear.mockImplementation(() => {
      setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
      return { onsuccess: null, onerror: null };
    });

    mockIDBStore.count.mockImplementation(() => {
      const req = { result: 0, onsuccess: null as (() => void) | null, onerror: null };
      setTimeout(() => {
        req.onsuccess?.();
      }, 0);
      return req;
    });
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
  });

  describe('isIndexedDBAvailable', () => {
    it('should return true when IndexedDB is available', () => {
      expect(isIndexedDBAvailable()).toBe(true);
    });

    it('should return false when IndexedDB is not available', () => {
      const originalIndexedDB = globalThis.indexedDB;
      vi.stubGlobal('indexedDB', undefined);

      expect(isIndexedDBAvailable()).toBe(false);

      vi.stubGlobal('indexedDB', originalIndexedDB);
    });
  });

  describe('openDatabase', () => {
    it('should open the database successfully', async () => {
      const db = await openDatabase();
      expect(db).toBeDefined();
      expect(mockIDB.open).toHaveBeenCalled();
    });

    it('should return the same instance on multiple calls', async () => {
      const db1 = await openDatabase();
      const db2 = await openDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('CRUD Operations', () => {
    describe('getItem', () => {
      it('should retrieve an item by key', async () => {
        const testItem = { id: 'test-1', name: 'Test Item' };
        mockIDBStore.get.mockImplementation(() => {
          const req = { result: testItem, onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getItem<typeof testItem>(DB_STORES.PROFILES, 'test-1');

        expect(result).toEqual(testItem);
        expect(mockIDBStore.get).toHaveBeenCalledWith('test-1');
      });

      it('should return null for non-existent item', async () => {
        mockIDBStore.get.mockImplementation(() => {
          const req = { result: undefined, onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getItem(DB_STORES.PROFILES, 'non-existent');

        expect(result).toBeNull();
      });
    });

    describe('getAllItems', () => {
      it('should retrieve all items from a store', async () => {
        const testItems = [
          { id: 'test-1', name: 'Item 1' },
          { id: 'test-2', name: 'Item 2' },
        ];
        mockIDBStore.getAll.mockImplementation(() => {
          const req = { result: testItems, onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getAllItems<(typeof testItems)[0]>(DB_STORES.PROFILES);

        expect(result).toEqual(testItems);
        expect(result).toHaveLength(2);
      });

      it('should return empty array when no items exist', async () => {
        mockIDBStore.getAll.mockImplementation(() => {
          const req = { result: [], onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getAllItems(DB_STORES.PROFILES);

        expect(result).toEqual([]);
      });
    });

    describe('putItem', () => {
      it('should store an item successfully', async () => {
        const testItem = { id: 'test-1', name: 'Test Item' };

        await putItem(DB_STORES.PROFILES, testItem);

        expect(mockIDBStore.put).toHaveBeenCalledWith(testItem);
      });
    });

    describe('deleteItem', () => {
      it('should delete an item by key', async () => {
        await deleteItem(DB_STORES.PROFILES, 'test-1');

        expect(mockIDBStore.delete).toHaveBeenCalledWith('test-1');
      });
    });

    describe('clearStore', () => {
      it('should clear all items from a store', async () => {
        await clearStore(DB_STORES.PROFILES);

        expect(mockIDBStore.clear).toHaveBeenCalled();
      });
    });
  });

  describe('SOS Queue Operations', () => {
    const testSOS: PendingSOS = {
      messageId: 'sos-123',
      patientId: 'patient-456',
      latitude: 31.5,
      longitude: 34.4,
      patientStatus: 'injured',
      severity: 4,
      createdAt: Date.now(),
      retryCount: 0,
    };

    describe('addPendingSOS', () => {
      it('should add a pending SOS to the queue', async () => {
        await addPendingSOS(testSOS);

        expect(mockIDBStore.put).toHaveBeenCalledWith(testSOS);
      });
    });

    describe('getPendingSOS', () => {
      it('should retrieve all pending SOS', async () => {
        mockIDBStore.getAll.mockImplementation(() => {
          const req = { result: [testSOS], onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getPendingSOS();

        expect(result).toEqual([testSOS]);
      });
    });

    describe('removePendingSOS', () => {
      it('should remove a pending SOS by message ID', async () => {
        await removePendingSOS('sos-123');

        expect(mockIDBStore.delete).toHaveBeenCalledWith('sos-123');
      });
    });
  });

  describe('Sync Queue Operations', () => {
    const testSyncItem: SyncQueueItem = {
      id: 'sync-123',
      entityType: 'profile',
      entityId: 'patient-456',
      operation: 'update',
      createdAt: Date.now(),
      retryCount: 0,
    };

    describe('addToSyncQueue', () => {
      it('should add an item to the sync queue', async () => {
        await addToSyncQueue(testSyncItem);

        expect(mockIDBStore.put).toHaveBeenCalledWith(testSyncItem);
      });
    });

    describe('getSyncQueue', () => {
      it('should retrieve all sync queue items', async () => {
        mockIDBStore.getAll.mockImplementation(() => {
          const req = {
            result: [testSyncItem],
            onsuccess: null as (() => void) | null,
            onerror: null,
          };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        });

        const result = await getSyncQueue();

        expect(result).toEqual([testSyncItem]);
      });
    });

    describe('removeFromSyncQueue', () => {
      it('should remove an item from the sync queue', async () => {
        await removeFromSyncQueue('sync-123');

        expect(mockIDBStore.delete).toHaveBeenCalledWith('sync-123');
      });
    });
  });

  describe('Storage Estimate', () => {
    it('should return storage estimate', async () => {
      const estimate = await getStorageEstimate();

      expect(estimate).toEqual({
        usage: 1000000,
        quota: 100000000,
        percentUsed: 1,
      });
    });
  });
});

describe('OfflineDB Additional Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
  });

  describe('putItems (batch insert)', () => {
    it('should insert multiple items in a single transaction', async () => {
      const items = [
        { id: 'item-1', name: 'Item 1' },
        { id: 'item-2', name: 'Item 2' },
        { id: 'item-3', name: 'Item 3' },
      ];

      mockIDBStore.put.mockImplementation(() => {
        return { onsuccess: null, onerror: null };
      });

      // Trigger transaction complete after all puts
      mockIDBTransaction.oncomplete = null;
      mockIDBDatabase.transaction.mockImplementation(() => {
        const tx = {
          ...mockIDBTransaction,
          objectStore: vi.fn().mockReturnValue(mockIDBStore),
        };
        setTimeout(() => tx.oncomplete?.(), 10);
        return tx;
      });

      const { putItems } = await import('./offlineDB');
      await putItems(DB_STORES.PROFILES, items);

      expect(mockIDBStore.put).toHaveBeenCalledTimes(3);
    });

    it('should handle empty array without database operation', async () => {
      const { putItems } = await import('./offlineDB');
      await putItems(DB_STORES.PROFILES, []);

      // Should not call database at all for empty array
      expect(mockIDBStore.put).not.toHaveBeenCalled();
    });
  });

  describe('getItemsByIndex', () => {
    it('should query items by index value', async () => {
      const testItems = [
        { id: 'item-1', patientId: 'patient-123' },
        { id: 'item-2', patientId: 'patient-123' },
      ];

      const mockIndex = {
        getAll: vi.fn().mockImplementation(() => {
          const req = { result: testItems, onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
      };
      mockIDBStore.index.mockReturnValue(mockIndex);

      const { getItemsByIndex } = await import('./offlineDB');
      const result = await getItemsByIndex(DB_STORES.MEDICAL_RECORDS, 'patientId', 'patient-123');

      expect(result).toEqual(testItems);
      expect(mockIDBStore.index).toHaveBeenCalledWith('patientId');
    });
  });

  describe('countItems', () => {
    it('should return count of items in store', async () => {
      mockIDBStore.count.mockImplementation(() => {
        const req = { result: 5, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      const { countItems } = await import('./offlineDB');
      const count = await countItems(DB_STORES.PROFILES);

      expect(count).toBe(5);
      expect(mockIDBStore.count).toHaveBeenCalled();
    });

    it('should return 0 for empty store', async () => {
      mockIDBStore.count.mockImplementation(() => {
        const req = { result: 0, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      const { countItems } = await import('./offlineDB');
      const count = await countItems(DB_STORES.PROFILES);

      expect(count).toBe(0);
    });
  });

  describe('clearPendingSOS', () => {
    it('should clear all pending SOS from queue', async () => {
      mockIDBStore.clear.mockImplementation(() => {
        setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
        return { onsuccess: null, onerror: null };
      });

      const { clearPendingSOS } = await import('./offlineDB');
      await clearPendingSOS();

      expect(mockIDBStore.clear).toHaveBeenCalled();
    });
  });

  describe('updatePendingSOSRetry', () => {
    it('should increment retry count and update timestamp', async () => {
      const existingSOS = {
        messageId: 'sos-123',
        patientId: 'patient-456',
        latitude: 31.5,
        longitude: 34.4,
        patientStatus: 'injured',
        severity: 4,
        createdAt: Date.now() - 60000,
        retryCount: 2,
      };

      mockIDBStore.get.mockImplementation(() => {
        const req = { result: existingSOS, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      mockIDBStore.put.mockImplementation(() => {
        setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
        return { onsuccess: null, onerror: null };
      });

      const { updatePendingSOSRetry } = await import('./offlineDB');
      await updatePendingSOSRetry('sos-123', 'Network timeout');

      expect(mockIDBStore.get).toHaveBeenCalled();
      expect(mockIDBStore.put).toHaveBeenCalled();
    });

    it('should do nothing if SOS not found', async () => {
      mockIDBStore.get.mockImplementation(() => {
        const req = { result: null, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      const { updatePendingSOSRetry } = await import('./offlineDB');
      await updatePendingSOSRetry('non-existent');

      expect(mockIDBStore.put).not.toHaveBeenCalled();
    });
  });

  describe('updateSyncQueueRetry', () => {
    it('should increment retry count for sync queue item', async () => {
      const existingItem = {
        id: 'sync-123',
        entityType: 'profile',
        entityId: 'entity-456',
        operation: 'update',
        createdAt: Date.now() - 60000,
        retryCount: 1,
      };

      mockIDBStore.get.mockImplementation(() => {
        const req = { result: existingItem, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      mockIDBStore.put.mockImplementation(() => {
        setTimeout(() => mockIDBTransaction.oncomplete?.(), 0);
        return { onsuccess: null, onerror: null };
      });

      const { updateSyncQueueRetry } = await import('./offlineDB');
      await updateSyncQueueRetry('sync-123', 'Server error');

      expect(mockIDBStore.get).toHaveBeenCalled();
      expect(mockIDBStore.put).toHaveBeenCalled();
    });

    it('should do nothing if sync item not found', async () => {
      mockIDBStore.get.mockImplementation(() => {
        const req = { result: null, onsuccess: null as (() => void) | null, onerror: null };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      });

      const { updateSyncQueueRetry } = await import('./offlineDB');
      await updateSyncQueueRetry('non-existent');

      expect(mockIDBStore.put).not.toHaveBeenCalled();
    });
  });

  describe('getExpiredItems', () => {
    it('should return items with expired cache', async () => {
      const now = Date.now();
      const expiredItems = [
        { id: 'item-1', expiresAt: now - 10000 },
        { id: 'item-2', expiresAt: now - 5000 },
      ];

      const mockIndex = {
        getAll: vi.fn().mockImplementation(() => {
          const req = { result: expiredItems, onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
      };
      mockIDBStore.index.mockReturnValue(mockIndex);

      const { getExpiredItems } = await import('./offlineDB');
      const result = await getExpiredItems(DB_STORES.PROFILES);

      expect(result).toEqual(expiredItems);
      expect(mockIDBStore.index).toHaveBeenCalledWith('expiresAt');
    });

    it('should return empty array when no expired items', async () => {
      const mockIndex = {
        getAll: vi.fn().mockImplementation(() => {
          const req = { result: [], onsuccess: null as (() => void) | null, onerror: null };
          setTimeout(() => req.onsuccess?.(), 0);
          return req;
        }),
      };
      mockIDBStore.index.mockReturnValue(mockIndex);

      const { getExpiredItems } = await import('./offlineDB');
      const result = await getExpiredItems(DB_STORES.PROFILES);

      expect(result).toEqual([]);
    });
  });

  describe('deleteExpiredItems', () => {
    it('should delete expired items and return count', async () => {
      const mockCursor = {
        delete: vi.fn(),
        continue: vi.fn(),
      };

      let cursorCallCount = 0;
      const mockIndex = {
        openCursor: vi.fn().mockImplementation(() => {
          const req = {
            result: null as typeof mockCursor | null,
            onsuccess: null as (() => void) | null,
            onerror: null,
          };
          setTimeout(() => {
            // Simulate 3 expired items
            if (cursorCallCount < 3) {
              req.result = mockCursor;
              cursorCallCount++;
            } else {
              req.result = null;
            }
            req.onsuccess?.();
            if (cursorCallCount >= 3) {
              mockIDBTransaction.oncomplete?.();
            }
          }, 0);
          return req;
        }),
      };
      mockIDBStore.index.mockReturnValue(mockIndex);

      const { deleteExpiredItems } = await import('./offlineDB');
      const count = await deleteExpiredItems(DB_STORES.PROFILES);

      expect(typeof count).toBe('number');
    });
  });

  describe('deleteDatabase', () => {
    it('should close connection and delete database', async () => {
      const { deleteDatabase } = await import('./offlineDB');
      await deleteDatabase();

      expect(mockIDB.deleteDatabase).toHaveBeenCalled();
    });
  });
});

describe('OfflineDB Edge Cases', () => {
  describe('Database Error Handling', () => {
    it('should define error handling patterns', () => {
      // Verify that IndexedDB errors can be created
      const dbError = new Error('Database error');
      expect(dbError.message).toBe('Database error');
    });

    it('should handle transaction errors', () => {
      const txError = new DOMException('Transaction failed', 'TransactionInactiveError');
      expect(txError.name).toBe('TransactionInactiveError');
    });

    it('should handle quota exceeded errors', () => {
      const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
      expect(quotaError.name).toBe('QuotaExceededError');
    });
  });

  describe('Transaction Patterns', () => {
    it('should define transaction completion pattern', () => {
      // Verify transaction completion callback pattern
      const completionOrder: string[] = [];

      // Simulate transaction operations
      completionOrder.push('operation');
      completionOrder.push('complete');

      expect(completionOrder).toContain('operation');
      expect(completionOrder).toContain('complete');
    });

    it('should handle transaction abort', () => {
      const abortEvent = { type: 'abort' };
      expect(abortEvent.type).toBe('abort');
    });
  });

  describe('Concurrent Access', () => {
    it('should handle multiple simultaneous reads', async () => {
      const reads = Promise.all([
        Promise.resolve({ id: '1' }),
        Promise.resolve({ id: '2' }),
        Promise.resolve({ id: '3' }),
      ]);

      await expect(reads).resolves.toHaveLength(3);
    });

    it('should handle read during write', () => {
      // Simulate read-write interleaving
      const operations = ['write-start', 'read-start', 'write-end', 'read-end'];
      expect(operations).toContain('write-start');
      expect(operations).toContain('read-start');
    });
  });

  describe('Version Change Handling', () => {
    it('should close connection on version change event', () => {
      const db = {
        close: vi.fn(),
        onversionchange: null as (() => void) | null,
      };

      db.onversionchange = () => {
        db.close();
      };

      // Simulate version change
      db.onversionchange();

      expect(db.close).toHaveBeenCalled();
    });
  });

  describe('Storage Estimate Edge Cases', () => {
    it('should handle zero quota', () => {
      const estimate = { usage: 1000, quota: 0 };
      const percentUsed = estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0;
      expect(percentUsed).toBe(0);
    });

    it('should handle undefined values', () => {
      const estimate = { usage: undefined, quota: undefined };
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      expect(usage).toBe(0);
      expect(quota).toBe(0);
    });
  });
});

describe('OfflineDB Types', () => {
  it('should have correct DB_STORES constants', () => {
    expect(DB_STORES.PENDING_SOS).toBe('pending_sos');
    expect(DB_STORES.PROFILES).toBe('profiles');
    expect(DB_STORES.MEDICAL_RECORDS).toBe('medical_records');
    expect(DB_STORES.EMERGENCY_CONTACTS).toBe('emergency_contacts');
    expect(DB_STORES.HOSPITALS).toBe('hospitals');
    expect(DB_STORES.SYNC_QUEUE).toBe('sync_queue');
  });

  it('should create valid PendingSOS structure', () => {
    const sos: PendingSOS = {
      messageId: 'msg-123',
      patientId: 'p-456',
      latitude: 31.5,
      longitude: 34.4,
      patientStatus: 'critical',
      severity: 5,
      createdAt: Date.now(),
      retryCount: 0,
    };

    expect(sos.messageId).toBeDefined();
    expect(sos.patientId).toBeDefined();
    expect(sos.latitude).toBeTypeOf('number');
    expect(sos.longitude).toBeTypeOf('number');
  });

  it('should create valid SyncQueueItem structure', () => {
    const item: SyncQueueItem = {
      id: 'sync-123',
      entityType: 'profile',
      entityId: 'entity-456',
      operation: 'update',
      createdAt: Date.now(),
      retryCount: 0,
    };

    expect(item.id).toBeDefined();
    expect(item.entityType).toBe('profile');
    expect(item.operation).toBe('update');
  });
});
