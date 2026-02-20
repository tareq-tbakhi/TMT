/**
 * Offline State Store
 *
 * Zustand store for managing offline state and sync status.
 * Provides a centralized way to track connectivity and pending operations.
 *
 * @module store/offlineStore
 */

import { create } from 'zustand';
import { getPendingSOS, getSyncQueue, getStorageEstimate } from '../services/offlineDB';

// ─── Types ───────────────────────────────────────────────────────

export type ConnectionType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

export interface OfflineState {
  // Connectivity
  isOnline: boolean;
  connectionType: ConnectionType;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;

  // Sync status
  pendingSyncCount: number;
  pendingSOSCount: number;
  isSyncing: boolean;
  lastSyncAttemptAt: number | null;
  lastSyncSuccessAt: number | null;

  // Storage
  storageUsage: number;
  storageQuota: number;
  storagePercentUsed: number;
}

export interface OfflineActions {
  // Status updates
  setOnlineStatus: (isOnline: boolean) => void;
  setConnectionType: (type: ConnectionType) => void;
  setSyncing: (isSyncing: boolean) => void;

  // Refresh operations
  refreshPendingCounts: () => Promise<void>;
  refreshStorageEstimate: () => Promise<void>;
  checkConnection: () => Promise<boolean>;

  // Full refresh
  refresh: () => Promise<void>;
}

type OfflineStore = OfflineState & OfflineActions;

// ─── Initial State ───────────────────────────────────────────────

const initialState: OfflineState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  connectionType: 'unknown',
  lastOnlineAt: typeof navigator !== 'undefined' && navigator.onLine ? Date.now() : null,
  lastOfflineAt: null,
  pendingSyncCount: 0,
  pendingSOSCount: 0,
  isSyncing: false,
  lastSyncAttemptAt: null,
  lastSyncSuccessAt: null,
  storageUsage: 0,
  storageQuota: 0,
  storagePercentUsed: 0,
};

// ─── Store Implementation ────────────────────────────────────────

export const useOfflineStore = create<OfflineStore>((set, get) => ({
  ...initialState,

  // ─── Set Online Status ───────────────────────────────────────

  setOnlineStatus: (isOnline: boolean) => {
    const now = Date.now();

    if (isOnline) {
      set({
        isOnline: true,
        lastOnlineAt: now,
      });

      // Refresh pending counts when coming online
      get().refreshPendingCounts();
    } else {
      set({
        isOnline: false,
        lastOfflineAt: now,
      });
    }

    console.log(`[OfflineStore] Connection status: ${isOnline ? 'online' : 'offline'}`);
  },

  // ─── Set Connection Type ─────────────────────────────────────

  setConnectionType: (connectionType: ConnectionType) => {
    set({ connectionType });
  },

  // ─── Set Syncing Status ──────────────────────────────────────

  setSyncing: (isSyncing: boolean) => {
    const now = Date.now();

    if (isSyncing) {
      set({
        isSyncing: true,
        lastSyncAttemptAt: now,
      });
    } else {
      set({
        isSyncing: false,
        lastSyncSuccessAt: now,
      });

      // Refresh counts after sync
      get().refreshPendingCounts();
    }
  },

  // ─── Refresh Pending Counts ──────────────────────────────────

  refreshPendingCounts: async () => {
    try {
      const [pendingSOS, syncQueue] = await Promise.all([
        getPendingSOS(),
        getSyncQueue(),
      ]);

      set({
        pendingSOSCount: pendingSOS.length,
        pendingSyncCount: syncQueue.length,
      });
    } catch (error) {
      console.error('[OfflineStore] Failed to refresh pending counts:', error);
    }
  },

  // ─── Refresh Storage Estimate ────────────────────────────────

  refreshStorageEstimate: async () => {
    try {
      const estimate = await getStorageEstimate();

      if (estimate) {
        set({
          storageUsage: estimate.usage,
          storageQuota: estimate.quota,
          storagePercentUsed: estimate.percentUsed,
        });
      }
    } catch (error) {
      console.error('[OfflineStore] Failed to refresh storage estimate:', error);
    }
  },

  // ─── Check Connection ────────────────────────────────────────

  checkConnection: async () => {
    // First check navigator.onLine
    if (!navigator.onLine) {
      get().setOnlineStatus(false);
      return false;
    }

    // Then try to actually reach a server
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // Try to reach the API
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/health`, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-store',
      });

      clearTimeout(timeoutId);

      const isOnline = response.ok;
      get().setOnlineStatus(isOnline);
      return isOnline;
    } catch {
      // If fetch fails, we might still be "online" but server is unreachable
      // Use navigator.onLine as fallback
      const isOnline = navigator.onLine;
      get().setOnlineStatus(isOnline);
      return isOnline;
    }
  },

  // ─── Full Refresh ────────────────────────────────────────────

  refresh: async () => {
    await Promise.all([
      get().refreshPendingCounts(),
      get().refreshStorageEstimate(),
      get().checkConnection(),
    ]);
  },
}));

// ─── Network Event Listeners ─────────────────────────────────────

if (typeof window !== 'undefined') {
  // Listen for online/offline events
  window.addEventListener('online', () => {
    useOfflineStore.getState().setOnlineStatus(true);
  });

  window.addEventListener('offline', () => {
    useOfflineStore.getState().setOnlineStatus(false);
  });

  // Try to detect connection type (only works in some browsers/contexts)
  if ('connection' in navigator) {
    const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    if (connection) {
      const updateConnectionType = () => {
        const type = connection.effectiveType || connection.type || 'unknown';
        const connectionType: ConnectionType =
          type === '4g' || type === '3g' || type === '2g'
            ? 'cellular'
            : type === 'wifi'
            ? 'wifi'
            : type === 'ethernet'
            ? 'ethernet'
            : type === 'none'
            ? 'none'
            : 'unknown';

        useOfflineStore.getState().setConnectionType(connectionType);
      };

      connection.addEventListener('change', updateConnectionType);
      updateConnectionType(); // Initial check
    }
  }

  // Initial refresh
  setTimeout(() => {
    useOfflineStore.getState().refresh();
  }, 1000);
}

// ─── Types for Network Information API ───────────────────────────

interface NetworkInformation {
  effectiveType?: string;
  type?: string;
  addEventListener: (event: string, callback: () => void) => void;
}

// ─── Utility Hooks ───────────────────────────────────────────────

/**
 * Check if there are any pending operations
 */
export function usePendingOperations(): boolean {
  const { pendingSyncCount, pendingSOSCount } = useOfflineStore();
  return pendingSyncCount > 0 || pendingSOSCount > 0;
}

/**
 * Get a human-readable offline duration
 */
export function useOfflineDuration(): string | null {
  const { isOnline, lastOfflineAt } = useOfflineStore();

  if (isOnline || !lastOfflineAt) return null;

  const durationMs = Date.now() - lastOfflineAt;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}
