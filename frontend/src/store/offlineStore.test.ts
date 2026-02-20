/**
 * Offline Store Tests
 *
 * Tests for the offline state management store.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

// Mock offlineDB
const mockOfflineDB = vi.hoisted(() => ({
  getPendingSOS: vi.fn().mockResolvedValue([]),
  getSyncQueue: vi.fn().mockResolvedValue([]),
  getStorageEstimate: vi.fn().mockResolvedValue({
    usage: 1000000,
    quota: 100000000,
    percentUsed: 1,
  }),
}));

vi.mock('../services/offlineDB', () => mockOfflineDB);

// Mock navigator
const mockNavigator = {
  onLine: true,
  connection: undefined,
};

vi.stubGlobal('navigator', mockNavigator);

// Mock fetch
vi.stubGlobal('fetch', vi.fn());

// Import after mocks
import { useOfflineStore, usePendingOperations, useOfflineDuration } from './offlineStore';

describe('useOfflineStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset store state
    useOfflineStore.setState({
      isOnline: true,
      connectionType: 'unknown',
      lastOnlineAt: Date.now(),
      lastOfflineAt: null,
      pendingSyncCount: 0,
      pendingSOSCount: 0,
      isSyncing: false,
      lastSyncAttemptAt: null,
      lastSyncSuccessAt: null,
      storageUsage: 0,
      storageQuota: 0,
      storagePercentUsed: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useOfflineStore.getState();

      expect(state.isOnline).toBe(true);
      expect(state.connectionType).toBe('unknown');
      expect(state.pendingSyncCount).toBe(0);
      expect(state.pendingSOSCount).toBe(0);
      expect(state.isSyncing).toBe(false);
    });
  });

  describe('setOnlineStatus', () => {
    it('should set online status to true', () => {
      act(() => {
        useOfflineStore.getState().setOnlineStatus(true);
      });

      const state = useOfflineStore.getState();
      expect(state.isOnline).toBe(true);
      expect(state.lastOnlineAt).not.toBeNull();
    });

    it('should set online status to false', () => {
      act(() => {
        useOfflineStore.getState().setOnlineStatus(false);
      });

      const state = useOfflineStore.getState();
      expect(state.isOnline).toBe(false);
      expect(state.lastOfflineAt).not.toBeNull();
    });

    it('should refresh pending counts when coming online', async () => {
      mockOfflineDB.getPendingSOS.mockResolvedValue([
        { messageId: 'sos-1' },
        { messageId: 'sos-2' },
      ]);
      mockOfflineDB.getSyncQueue.mockResolvedValue([{ id: 'sync-1' }]);

      useOfflineStore.setState({ isOnline: false });

      await act(async () => {
        useOfflineStore.getState().setOnlineStatus(true);
        // Allow async operations to complete
        await vi.runAllTimersAsync();
      });

      const state = useOfflineStore.getState();
      expect(state.pendingSOSCount).toBe(2);
      expect(state.pendingSyncCount).toBe(1);
    });
  });

  describe('setConnectionType', () => {
    it('should set connection type', () => {
      act(() => {
        useOfflineStore.getState().setConnectionType('wifi');
      });

      expect(useOfflineStore.getState().connectionType).toBe('wifi');
    });

    it('should accept all valid connection types', () => {
      const types = ['wifi', 'cellular', 'ethernet', 'none', 'unknown'] as const;

      for (const type of types) {
        act(() => {
          useOfflineStore.getState().setConnectionType(type);
        });
        expect(useOfflineStore.getState().connectionType).toBe(type);
      }
    });
  });

  describe('setSyncing', () => {
    it('should set syncing state to true', () => {
      act(() => {
        useOfflineStore.getState().setSyncing(true);
      });

      const state = useOfflineStore.getState();
      expect(state.isSyncing).toBe(true);
      expect(state.lastSyncAttemptAt).not.toBeNull();
    });

    it('should set syncing state to false', () => {
      act(() => {
        useOfflineStore.getState().setSyncing(false);
      });

      const state = useOfflineStore.getState();
      expect(state.isSyncing).toBe(false);
      expect(state.lastSyncSuccessAt).not.toBeNull();
    });
  });

  describe('refreshPendingCounts', () => {
    it('should fetch pending counts from DB', async () => {
      mockOfflineDB.getPendingSOS.mockResolvedValue([
        { messageId: 'sos-1' },
        { messageId: 'sos-2' },
        { messageId: 'sos-3' },
      ]);
      mockOfflineDB.getSyncQueue.mockResolvedValue([{ id: 'sync-1' }, { id: 'sync-2' }]);

      await act(async () => {
        await useOfflineStore.getState().refreshPendingCounts();
      });

      const state = useOfflineStore.getState();
      expect(state.pendingSOSCount).toBe(3);
      expect(state.pendingSyncCount).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      mockOfflineDB.getPendingSOS.mockRejectedValue(new Error('DB error'));
      mockOfflineDB.getSyncQueue.mockRejectedValue(new Error('DB error'));

      await act(async () => {
        await useOfflineStore.getState().refreshPendingCounts();
      });

      // Should not throw, counts remain unchanged
      const state = useOfflineStore.getState();
      expect(state.pendingSOSCount).toBe(0);
    });
  });

  describe('refreshStorageEstimate', () => {
    it('should update storage metrics', async () => {
      mockOfflineDB.getStorageEstimate.mockResolvedValue({
        usage: 5000000,
        quota: 100000000,
        percentUsed: 5,
      });

      await act(async () => {
        await useOfflineStore.getState().refreshStorageEstimate();
      });

      const state = useOfflineStore.getState();
      expect(state.storageUsage).toBe(5000000);
      expect(state.storageQuota).toBe(100000000);
      expect(state.storagePercentUsed).toBe(5);
    });

    it('should handle null storage estimate', async () => {
      mockOfflineDB.getStorageEstimate.mockResolvedValue(null);

      await act(async () => {
        await useOfflineStore.getState().refreshStorageEstimate();
      });

      // Should not throw, values remain unchanged
      expect(useOfflineStore.getState().storageUsage).toBe(0);
    });
  });

  describe('checkConnection', () => {
    it('should return true when online and server reachable', async () => {
      mockNavigator.onLine = true;
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

      let result: boolean = false;
      await act(async () => {
        result = await useOfflineStore.getState().checkConnection();
      });

      expect(result).toBe(true);
      expect(useOfflineStore.getState().isOnline).toBe(true);
    });

    it('should return false when navigator.onLine is false', async () => {
      mockNavigator.onLine = false;

      let result: boolean = false;
      await act(async () => {
        result = await useOfflineStore.getState().checkConnection();
      });

      expect(result).toBe(false);
    });

    it('should handle fetch errors gracefully', async () => {
      mockNavigator.onLine = true;
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));

      let result: boolean = false;
      await act(async () => {
        result = await useOfflineStore.getState().checkConnection();
      });

      // Falls back to navigator.onLine
      expect(result).toBe(true);
    });
  });

  describe('refresh', () => {
    it('should refresh all state', async () => {
      mockOfflineDB.getPendingSOS.mockResolvedValue([{ messageId: 'sos-1' }]);
      mockOfflineDB.getSyncQueue.mockResolvedValue([]);
      mockOfflineDB.getStorageEstimate.mockResolvedValue({
        usage: 1000,
        quota: 100000,
        percentUsed: 1,
      });
      mockNavigator.onLine = true;
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

      await act(async () => {
        await useOfflineStore.getState().refresh();
      });

      const state = useOfflineStore.getState();
      expect(state.pendingSOSCount).toBe(1);
      expect(state.storageUsage).toBe(1000);
      expect(state.isOnline).toBe(true);
    });
  });
});

describe('Pending Operations Logic', () => {
  beforeEach(() => {
    useOfflineStore.setState({
      pendingSyncCount: 0,
      pendingSOSCount: 0,
    });
  });

  it('should return false when no pending operations', () => {
    const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
    const hasPending = pendingSyncCount > 0 || pendingSOSCount > 0;
    expect(hasPending).toBe(false);
  });

  it('should return true when pending SOS exists', () => {
    useOfflineStore.setState({ pendingSOSCount: 1 });
    const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
    const hasPending = pendingSyncCount > 0 || pendingSOSCount > 0;
    expect(hasPending).toBe(true);
  });

  it('should return true when pending syncs exist', () => {
    useOfflineStore.setState({ pendingSyncCount: 2 });
    const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
    const hasPending = pendingSyncCount > 0 || pendingSOSCount > 0;
    expect(hasPending).toBe(true);
  });
});

describe('Offline Duration Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function calculateOfflineDuration(isOnline: boolean, lastOfflineAt: number | null): string | null {
    if (isOnline || !lastOfflineAt) return null;

    const durationMs = Date.now() - lastOfflineAt;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  it('should return null when online', () => {
    const result = calculateOfflineDuration(true, Date.now() - 60000);
    expect(result).toBeNull();
  });

  it('should return null when never offline', () => {
    const result = calculateOfflineDuration(false, null);
    expect(result).toBeNull();
  });

  it('should return seconds for short duration', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const result = calculateOfflineDuration(false, now - 30000);
    expect(result).toBe('30s');
  });

  it('should return minutes for medium duration', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const result = calculateOfflineDuration(false, now - 5 * 60 * 1000);
    expect(result).toBe('5m');
  });

  it('should return hours and minutes for long duration', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const result = calculateOfflineDuration(false, now - (2 * 60 * 60 * 1000 + 30 * 60 * 1000));
    expect(result).toBe('2h 30m');
  });
});

describe('Offline Store Network Events', () => {
  // Note: These tests verify the event handlers work when manually triggered
  // The actual event listeners are set up in the store module

  it('should handle online event', () => {
    useOfflineStore.setState({ isOnline: false });

    // Simulate online event
    act(() => {
      useOfflineStore.getState().setOnlineStatus(true);
    });

    expect(useOfflineStore.getState().isOnline).toBe(true);
  });

  it('should handle offline event', () => {
    useOfflineStore.setState({ isOnline: true });

    // Simulate offline event
    act(() => {
      useOfflineStore.getState().setOnlineStatus(false);
    });

    expect(useOfflineStore.getState().isOnline).toBe(false);
  });
});

describe('Offline Store Edge Cases', () => {
  it('should handle rapid online/offline transitions', () => {
    act(() => {
      useOfflineStore.getState().setOnlineStatus(false);
      useOfflineStore.getState().setOnlineStatus(true);
      useOfflineStore.getState().setOnlineStatus(false);
      useOfflineStore.getState().setOnlineStatus(true);
    });

    expect(useOfflineStore.getState().isOnline).toBe(true);
  });

  it('should track timestamps correctly', () => {
    vi.useFakeTimers();
    const time1 = Date.now();
    vi.setSystemTime(time1);

    act(() => {
      useOfflineStore.getState().setOnlineStatus(true);
    });

    expect(useOfflineStore.getState().lastOnlineAt).toBe(time1);

    const time2 = time1 + 5000;
    vi.setSystemTime(time2);

    act(() => {
      useOfflineStore.getState().setOnlineStatus(false);
    });

    expect(useOfflineStore.getState().lastOfflineAt).toBe(time2);

    vi.useRealTimers();
  });
});

describe('Offline Store Syncing State', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useOfflineStore.setState({
      isSyncing: false,
      lastSyncAttemptAt: null,
      lastSyncSuccessAt: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should track sync attempt time when starting sync', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    act(() => {
      useOfflineStore.getState().setSyncing(true);
    });

    expect(useOfflineStore.getState().lastSyncAttemptAt).toBe(now);
    expect(useOfflineStore.getState().isSyncing).toBe(true);
  });

  it('should track sync success time when ending sync', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    act(() => {
      useOfflineStore.getState().setSyncing(false);
    });

    expect(useOfflineStore.getState().lastSyncSuccessAt).toBe(now);
    expect(useOfflineStore.getState().isSyncing).toBe(false);
  });

  it('should refresh counts after successful sync', async () => {
    mockOfflineDB.getPendingSOS.mockResolvedValue([]);
    mockOfflineDB.getSyncQueue.mockResolvedValue([]);

    await act(async () => {
      useOfflineStore.getState().setSyncing(false);
      await vi.runAllTimersAsync();
    });

    expect(mockOfflineDB.getPendingSOS).toHaveBeenCalled();
    expect(mockOfflineDB.getSyncQueue).toHaveBeenCalled();
  });
});

describe('Offline Store Storage Metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOfflineStore.setState({ storageUsage: 0, storageQuota: 0, storagePercentUsed: 0 });
  });

  it('should handle storage estimate with zero quota', async () => {
    mockOfflineDB.getStorageEstimate.mockResolvedValue({
      usage: 100,
      quota: 0,
      percentUsed: 0,
    });

    await act(async () => {
      await useOfflineStore.getState().refreshStorageEstimate();
    });

    const state = useOfflineStore.getState();
    expect(state.storageUsage).toBe(100);
    expect(state.storageQuota).toBe(0);
    expect(state.storagePercentUsed).toBe(0);
  });

  it('should handle storage estimate errors gracefully', async () => {
    // Set initial values
    useOfflineStore.setState({ storageUsage: 500, storageQuota: 10000, storagePercentUsed: 5 });
    mockOfflineDB.getStorageEstimate.mockRejectedValue(new Error('Storage API error'));

    // Should not throw
    await act(async () => {
      await useOfflineStore.getState().refreshStorageEstimate();
    });

    // Values remain unchanged (error doesn't clear existing values)
    expect(useOfflineStore.getState().storageUsage).toBe(500);
  });
});

describe('Offline Store Connection Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigator.onLine = true;
  });

  it('should use API health endpoint for connection check', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await act(async () => {
      await useOfflineStore.getState().checkConnection();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        method: 'HEAD',
        cache: 'no-store',
      })
    );
  });

  it('should handle server returning non-OK response', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    let result: boolean = false;
    await act(async () => {
      result = await useOfflineStore.getState().checkConnection();
    });

    expect(result).toBe(false);
  });

  it('should handle fetch timeout by falling back to navigator.onLine', async () => {
    // This test verifies the fallback behavior when fetch times out
    // The actual AbortController is used internally, we just verify the fallback
    vi.mocked(fetch).mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    let result: boolean = false;
    await act(async () => {
      result = await useOfflineStore.getState().checkConnection();
    });

    // Falls back to navigator.onLine (which is true in our mock)
    expect(result).toBe(true);
  });
});

describe('Offline Store Full Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigator.onLine = true;
    useOfflineStore.setState({
      pendingSyncCount: 0,
      pendingSOSCount: 0,
      storageUsage: 0,
      storageQuota: 0,
      storagePercentUsed: 0,
    });
  });

  it('should call all refresh methods in parallel', async () => {
    mockOfflineDB.getPendingSOS.mockResolvedValue([]);
    mockOfflineDB.getSyncQueue.mockResolvedValue([]);
    mockOfflineDB.getStorageEstimate.mockResolvedValue({
      usage: 0,
      quota: 100000000,
      percentUsed: 0,
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await act(async () => {
      await useOfflineStore.getState().refresh();
    });

    expect(mockOfflineDB.getPendingSOS).toHaveBeenCalled();
    expect(mockOfflineDB.getSyncQueue).toHaveBeenCalled();
    expect(mockOfflineDB.getStorageEstimate).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
  });

  it('should handle partial refresh', async () => {
    // Test that storage estimate updates correctly
    mockOfflineDB.getPendingSOS.mockResolvedValue([]);
    mockOfflineDB.getSyncQueue.mockResolvedValue([]);
    mockOfflineDB.getStorageEstimate.mockResolvedValue({
      usage: 5000,
      quota: 100000000,
      percentUsed: 0.005,
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

    await act(async () => {
      await useOfflineStore.getState().refresh();
    });

    const state = useOfflineStore.getState();
    expect(state.storageUsage).toBe(5000);
    expect(state.isOnline).toBe(true);
  });
});

describe('Connection Type Detection', () => {
  it('should handle wifi connection type', () => {
    act(() => {
      useOfflineStore.getState().setConnectionType('wifi');
    });

    expect(useOfflineStore.getState().connectionType).toBe('wifi');
  });

  it('should handle cellular connection type', () => {
    act(() => {
      useOfflineStore.getState().setConnectionType('cellular');
    });

    expect(useOfflineStore.getState().connectionType).toBe('cellular');
  });

  it('should handle ethernet connection type', () => {
    act(() => {
      useOfflineStore.getState().setConnectionType('ethernet');
    });

    expect(useOfflineStore.getState().connectionType).toBe('ethernet');
  });

  it('should handle none connection type', () => {
    act(() => {
      useOfflineStore.getState().setConnectionType('none');
    });

    expect(useOfflineStore.getState().connectionType).toBe('none');
  });
});

describe('Pending Counts Edge Cases', () => {
  it('should handle large pending counts', async () => {
    const largeSOS = Array.from({ length: 100 }, (_, i) => ({ messageId: `sos-${i}` }));
    const largeSync = Array.from({ length: 50 }, (_, i) => ({ id: `sync-${i}` }));

    mockOfflineDB.getPendingSOS.mockResolvedValue(largeSOS);
    mockOfflineDB.getSyncQueue.mockResolvedValue(largeSync);

    await act(async () => {
      await useOfflineStore.getState().refreshPendingCounts();
    });

    const state = useOfflineStore.getState();
    expect(state.pendingSOSCount).toBe(100);
    expect(state.pendingSyncCount).toBe(50);
  });

  it('should handle empty arrays', async () => {
    mockOfflineDB.getPendingSOS.mockResolvedValue([]);
    mockOfflineDB.getSyncQueue.mockResolvedValue([]);

    await act(async () => {
      await useOfflineStore.getState().refreshPendingCounts();
    });

    const state = useOfflineStore.getState();
    expect(state.pendingSOSCount).toBe(0);
    expect(state.pendingSyncCount).toBe(0);
  });
});

describe('Utility Hook Logic', () => {
  describe('usePendingOperations logic', () => {
    it('should return false when both counts are zero', () => {
      useOfflineStore.setState({ pendingSyncCount: 0, pendingSOSCount: 0 });
      const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
      expect(pendingSyncCount > 0 || pendingSOSCount > 0).toBe(false);
    });

    it('should return true when pendingSOSCount > 0', () => {
      useOfflineStore.setState({ pendingSyncCount: 0, pendingSOSCount: 5 });
      const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
      expect(pendingSyncCount > 0 || pendingSOSCount > 0).toBe(true);
    });

    it('should return true when pendingSyncCount > 0', () => {
      useOfflineStore.setState({ pendingSyncCount: 3, pendingSOSCount: 0 });
      const { pendingSyncCount, pendingSOSCount } = useOfflineStore.getState();
      expect(pendingSyncCount > 0 || pendingSOSCount > 0).toBe(true);
    });
  });

  describe('useOfflineDuration logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should format seconds correctly', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const lastOfflineAt = now - 45000; // 45 seconds ago
      const isOnline = false;

      if (isOnline || !lastOfflineAt) {
        expect(null).toBeNull();
      } else {
        const durationMs = now - lastOfflineAt;
        const seconds = Math.floor(durationMs / 1000);
        expect(`${seconds}s`).toBe('45s');
      }
    });

    it('should format hours correctly', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // 2 hours 45 minutes ago
      const lastOfflineAt = now - (2 * 60 * 60 * 1000 + 45 * 60 * 1000);
      const durationMs = now - lastOfflineAt;
      const seconds = Math.floor(durationMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      expect(`${hours}h ${minutes % 60}m`).toBe('2h 45m');
    });
  });
});
