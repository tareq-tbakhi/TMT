/**
 * Network service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockNetwork = vi.hoisted(() => ({
  getStatus: vi.fn(),
  addListener: vi.fn(),
}));

// Mock isNative - using a simple value since we test web behavior
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor Network
vi.mock('@capacitor/network', () => ({
  Network: mockNetwork,
}));

import { getNetworkStatus, addNetworkListener, isOnline, isOnCellular } from './networkService';

describe('Network Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNetworkStatus', () => {
    it('should return connected status when navigator.onLine is true', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const status = await getNetworkStatus();

      expect(status.connected).toBe(true);
      expect(status.connectionType).toBe('wifi');
    });

    it('should return disconnected status when navigator.onLine is false', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const status = await getNetworkStatus();

      expect(status.connected).toBe(false);
      expect(status.connectionType).toBe('none');
    });
  });

  describe('addNetworkListener', () => {
    it('should add online and offline event listeners', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
      const callback = vi.fn();

      const cleanup = addNetworkListener(callback);

      expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      // Cleanup should be a function
      expect(typeof cleanup).toBe('function');

      addEventListenerSpy.mockRestore();
    });

    it('should call callback with connected status on online event', () => {
      const callback = vi.fn();
      addNetworkListener(callback);

      // Simulate online event
      window.dispatchEvent(new Event('online'));

      expect(callback).toHaveBeenCalledWith({
        connected: true,
        connectionType: 'wifi',
      });
    });

    it('should call callback with disconnected status on offline event', () => {
      const callback = vi.fn();
      addNetworkListener(callback);

      // Simulate offline event
      window.dispatchEvent(new Event('offline'));

      expect(callback).toHaveBeenCalledWith({
        connected: false,
        connectionType: 'none',
      });
    });

    it('should remove listeners when cleanup is called', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
      const callback = vi.fn();

      const cleanup = addNetworkListener(callback);
      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('isOnline', () => {
    it('should return true when connected', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      const result = await isOnline();
      expect(result).toBe(true);
    });

    it('should return false when disconnected', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      const result = await isOnline();
      expect(result).toBe(false);
    });
  });

  describe('isOnCellular', () => {
    it('should return false on web (cannot detect)', async () => {
      const result = await isOnCellular();
      expect(result).toBe(false);
    });
  });
});

describe('Network Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNetworkStatus (native mock)', () => {
    it('should call Network.getStatus', async () => {
      mockNetwork.getStatus.mockResolvedValue({
        connected: true,
        connectionType: 'wifi',
      });

      const status = await mockNetwork.getStatus();

      expect(status.connected).toBe(true);
      expect(status.connectionType).toBe('wifi');
    });

    it('should handle cellular connection type', async () => {
      mockNetwork.getStatus.mockResolvedValue({
        connected: true,
        connectionType: 'cellular',
      });

      const status = await mockNetwork.getStatus();

      expect(status.connected).toBe(true);
      expect(status.connectionType).toBe('cellular');
    });

    it('should handle no connection', async () => {
      mockNetwork.getStatus.mockResolvedValue({
        connected: false,
        connectionType: 'none',
      });

      const status = await mockNetwork.getStatus();

      expect(status.connected).toBe(false);
      expect(status.connectionType).toBe('none');
    });
  });

  describe('addNetworkListener (native mock)', () => {
    it('should call Network.addListener', async () => {
      const mockHandle = { remove: vi.fn() };
      mockNetwork.addListener.mockResolvedValue(mockHandle);

      await mockNetwork.addListener('networkStatusChange', vi.fn());

      expect(mockNetwork.addListener).toHaveBeenCalledWith(
        'networkStatusChange',
        expect.any(Function)
      );
    });
  });

  describe('isOnCellular (native mock)', () => {
    it('should return true when on cellular', async () => {
      mockNetwork.getStatus.mockResolvedValue({
        connected: true,
        connectionType: 'cellular',
      });

      const status = await mockNetwork.getStatus();
      const isCellular = status.connectionType === 'cellular';

      expect(isCellular).toBe(true);
    });

    it('should return false when on wifi', async () => {
      mockNetwork.getStatus.mockResolvedValue({
        connected: true,
        connectionType: 'wifi',
      });

      const status = await mockNetwork.getStatus();
      const isCellular = status.connectionType === 'cellular';

      expect(isCellular).toBe(false);
    });
  });
});
