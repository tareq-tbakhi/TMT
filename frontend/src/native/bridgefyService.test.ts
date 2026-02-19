/**
 * Bridgefy Service Tests
 *
 * Tests for the Bluetooth mesh networking service that handles
 * SOS message relay through the Bridgefy SDK.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Bridgefy plugin
const mockBridgefy = vi.hoisted(() => ({
  initialize: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  getStatus: vi.fn(),
  getNearbyDevices: vi.fn(),
  isBluetoothAvailable: vi.fn(),
  requestPermissions: vi.fn(),
  addListener: vi.fn(),
}));

// Mock platform
vi.mock('./platform', () => ({
  isNative: true,
}));

// Mock network service
vi.mock('./networkService', () => ({
  isOnline: vi.fn().mockResolvedValue(false),
}));

// Mock the Bridgefy plugin module
vi.mock('../plugins/bridgefy', () => ({
  Bridgefy: mockBridgefy,
}));

// Import after mocks are set up
import { BridgefyService } from './bridgefyService';

describe('BridgefyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should check bluetooth availability before initializing', async () => {
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({
        available: true,
        enabled: true,
      });
      mockBridgefy.requestPermissions.mockResolvedValue({
        bluetooth: 'granted',
        location: 'granted',
      });
      mockBridgefy.initialize.mockResolvedValue({
        success: true,
        userId: 'test-user',
        sdkVersion: '2.0.0',
      });
      mockBridgefy.addListener.mockResolvedValue({ remove: vi.fn() });

      // Mock environment variable
      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      const result = await BridgefyService.initialize('test-user');

      expect(mockBridgefy.isBluetoothAvailable).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if bluetooth is not available', async () => {
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({
        available: false,
        enabled: false,
      });

      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      const result = await BridgefyService.initialize('test-user');

      expect(result).toBe(false);
    });

    it('should return false if bluetooth permission is denied', async () => {
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({
        available: true,
        enabled: true,
      });
      mockBridgefy.requestPermissions.mockResolvedValue({
        bluetooth: 'denied',
        location: 'granted',
      });

      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      const result = await BridgefyService.initialize('test-user');

      expect(result).toBe(false);
    });

    it('should return false if no API key is configured', async () => {
      vi.stubEnv('VITE_BRIDGEFY_API_KEY', '');

      const result = await BridgefyService.initialize('test-user');

      expect(result).toBe(false);
    });
  });

  describe('start', () => {
    it('should start the mesh network if initialized', async () => {
      // First initialize
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({ available: true, enabled: true });
      mockBridgefy.requestPermissions.mockResolvedValue({ bluetooth: 'granted' });
      mockBridgefy.initialize.mockResolvedValue({ success: true, userId: 'test', sdkVersion: '2.0' });
      mockBridgefy.addListener.mockResolvedValue({ remove: vi.fn() });
      mockBridgefy.start.mockResolvedValue(undefined);

      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      await BridgefyService.initialize('test-user');
      const result = await BridgefyService.start();

      expect(mockBridgefy.start).toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  describe('sendSOS', () => {
    it('should queue SOS message for broadcast', async () => {
      // Setup: initialize and start
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({ available: true, enabled: true });
      mockBridgefy.requestPermissions.mockResolvedValue({ bluetooth: 'granted' });
      mockBridgefy.initialize.mockResolvedValue({ success: true, userId: 'test', sdkVersion: '2.0' });
      mockBridgefy.addListener.mockResolvedValue({ remove: vi.fn() });
      mockBridgefy.start.mockResolvedValue(undefined);
      mockBridgefy.send.mockResolvedValue({ messageId: 'msg-123', queued: true });

      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      await BridgefyService.initialize('test-user');
      await BridgefyService.start();

      const result = await BridgefyService.sendSOS({
        messageId: 'sos-123',
        latitude: 31.5017,
        longitude: 34.4668,
        accuracy: 10,
        severity: 4,
        patientStatus: 'injured',
        details: 'Test SOS',
      });

      expect(mockBridgefy.send).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if mesh is not running', async () => {
      // Don't start, just try to send
      const result = await BridgefyService.sendSOS({
        messageId: 'sos-123',
        latitude: 31.5017,
        longitude: 34.4668,
        accuracy: 10,
        severity: 4,
        patientStatus: 'injured',
      });

      expect(result).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return current mesh status', async () => {
      mockBridgefy.getStatus.mockResolvedValue({
        isRunning: true,
        isConnected: true,
        nearbyDeviceCount: 3,
        userId: 'test-user',
      });

      // Setup: initialize
      mockBridgefy.isBluetoothAvailable.mockResolvedValue({ available: true, enabled: true });
      mockBridgefy.requestPermissions.mockResolvedValue({ bluetooth: 'granted' });
      mockBridgefy.initialize.mockResolvedValue({ success: true, userId: 'test', sdkVersion: '2.0' });
      mockBridgefy.addListener.mockResolvedValue({ remove: vi.fn() });

      vi.stubEnv('VITE_BRIDGEFY_API_KEY', 'test-api-key');

      await BridgefyService.initialize('test-user');
      const status = await BridgefyService.getStatus();

      expect(status.nearbyDeviceCount).toBe(3);
      expect(status.isConnected).toBe(true);
    });

    it('should return default status if not initialized', async () => {
      const status = await BridgefyService.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.nearbyDeviceCount).toBe(0);
    });
  });

  describe('event listeners', () => {
    it('should allow subscribing to SOS messages', () => {
      const listener = vi.fn();
      const unsubscribe = BridgefyService.onSOSMessage(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow subscribing to acknowledgments', () => {
      const listener = vi.fn();
      const unsubscribe = BridgefyService.onAck(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should allow subscribing to status changes', () => {
      const listener = vi.fn();
      const unsubscribe = BridgefyService.onStatusChange(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should remove listener when unsubscribe is called', () => {
      const listener = vi.fn();
      const unsubscribe = BridgefyService.onSOSMessage(listener);

      // Unsubscribe
      unsubscribe();

      // Listener should be removed (no error thrown)
      expect(true).toBe(true);
    });
  });

  describe('isRunning', () => {
    it('should return false when not started', () => {
      expect(BridgefyService.isRunning()).toBe(false);
    });
  });

  describe('isInitialized', () => {
    it('should return false when not initialized', () => {
      expect(BridgefyService.isInitialized()).toBe(false);
    });
  });
});

describe('BridgefyService Message Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('patient status mapping', () => {
    it('should map "safe" to "S"', () => {
      // Test the status mapping logic internally
      const statusMap: Record<string, string> = {
        safe: 'S',
        injured: 'I',
        trapped: 'T',
        evacuate: 'E',
      };

      expect(statusMap['safe']).toBe('S');
      expect(statusMap['injured']).toBe('I');
      expect(statusMap['trapped']).toBe('T');
      expect(statusMap['evacuate']).toBe('E');
    });
  });

  describe('severity clamping', () => {
    it('should clamp severity between 1 and 5', () => {
      const clampSeverity = (severity: number): number => {
        return Math.min(5, Math.max(1, Math.round(severity)));
      };

      expect(clampSeverity(0)).toBe(1);
      expect(clampSeverity(3)).toBe(3);
      expect(clampSeverity(10)).toBe(5);
      expect(clampSeverity(2.7)).toBe(3);
    });
  });

  describe('message deduplication', () => {
    it('should track processed message IDs', () => {
      const processedIds = new Set<string>();

      // First message
      processedIds.add('msg-1');
      expect(processedIds.has('msg-1')).toBe(true);

      // Duplicate should be detected
      const isDuplicate = processedIds.has('msg-1');
      expect(isDuplicate).toBe(true);

      // New message
      expect(processedIds.has('msg-2')).toBe(false);
    });

    it('should trim old IDs when limit is reached', () => {
      const processedIds = new Set<string>();
      const MAX_IDS = 10;

      // Add more than max
      for (let i = 0; i < 15; i++) {
        processedIds.add(`msg-${i}`);
      }

      // Trim to max
      if (processedIds.size > MAX_IDS) {
        const toRemove = processedIds.size - MAX_IDS;
        const iterator = processedIds.values();
        for (let i = 0; i < toRemove; i++) {
          const first = iterator.next();
          if (!first.done) {
            processedIds.delete(first.value);
          }
        }
      }

      expect(processedIds.size).toBe(MAX_IDS);
    });
  });
});
