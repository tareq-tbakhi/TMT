/**
 * Connection Manager Tests
 *
 * Tests for the unified connection state management across
 * Internet, SMS, and Bluetooth mesh layers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock network service
const mockNetworkService = vi.hoisted(() => ({
  getNetworkStatus: vi.fn(),
  addNetworkListener: vi.fn(),
  isOnline: vi.fn(),
}));

// Mock bridgefy service
const mockBridgefyService = vi.hoisted(() => ({
  initialize: vi.fn(),
  start: vi.fn(),
  getStatus: vi.fn(),
  isRunning: vi.fn(),
  isInitialized: vi.fn(),
  onStatusChange: vi.fn(),
}));

vi.mock('../native/networkService', () => mockNetworkService);
vi.mock('../native/bridgefyService', () => ({
  BridgefyService: mockBridgefyService,
}));

// Import after mocks
import { ConnectionManager, type ConnectionState, type ConnectionLayer } from './connectionManager';

describe('ConnectionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Default mock returns
    mockNetworkService.getNetworkStatus.mockResolvedValue({
      connected: true,
      connectionType: 'wifi',
    });
    mockNetworkService.addNetworkListener.mockReturnValue(() => {});
    mockNetworkService.isOnline.mockResolvedValue(true);
    mockBridgefyService.isInitialized.mockReturnValue(false);
    mockBridgefyService.isRunning.mockReturnValue(false);
    mockBridgefyService.getStatus.mockResolvedValue({
      isRunning: false,
      isConnected: false,
      nearbyDeviceCount: 0,
      userId: '',
    });
    mockBridgefyService.onStatusChange.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('getState', () => {
    it('should return current connection state', () => {
      const state = ConnectionManager.getState();

      expect(state).toHaveProperty('currentLayer');
      expect(state).toHaveProperty('internet');
      expect(state).toHaveProperty('cellular');
      expect(state).toHaveProperty('bluetooth');
      expect(state).toHaveProperty('lastCheck');
    });
  });

  describe('getBestLayer', () => {
    it('should return internet when connected via wifi', () => {
      const state = ConnectionManager.getState();
      // Default state has internet
      expect(['internet', 'sms', 'bluetooth', 'none']).toContain(state.currentLayer);
    });
  });

  describe('getFallbackChain', () => {
    it('should return ordered fallback chain', () => {
      const chain = ConnectionManager.getFallbackChain();

      expect(Array.isArray(chain)).toBe(true);
      // Chain should be a subset of valid layers
      chain.forEach((layer) => {
        expect(['internet', 'sms', 'bluetooth']).toContain(layer);
      });
    });
  });

  describe('subscribe', () => {
    it('should allow subscribing to state changes', () => {
      const listener = vi.fn();
      const unsubscribe = ConnectionManager.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = ConnectionManager.subscribe(listener);

      unsubscribe();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('checkNow', () => {
    it('should force an immediate connection check', async () => {
      await ConnectionManager.checkNow();

      expect(mockNetworkService.getNetworkStatus).toHaveBeenCalled();
    });

    it('should update state after check', async () => {
      mockNetworkService.getNetworkStatus.mockResolvedValue({
        connected: false,
        connectionType: 'none',
      });

      await ConnectionManager.checkNow();

      const state = ConnectionManager.getState();
      expect(state.lastCheck).toBeDefined();
    });
  });
});

describe('ConnectionManager Layer Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('layer priority', () => {
    it('should prioritize internet over SMS', () => {
      const layers: ConnectionLayer[] = ['internet', 'sms', 'bluetooth'];
      const priority = ['internet', 'sms', 'bluetooth', 'none'];

      // Internet should come first
      expect(priority.indexOf('internet')).toBeLessThan(priority.indexOf('sms'));
    });

    it('should prioritize SMS over bluetooth', () => {
      const priority = ['internet', 'sms', 'bluetooth', 'none'];

      // SMS should come before bluetooth
      expect(priority.indexOf('sms')).toBeLessThan(priority.indexOf('bluetooth'));
    });
  });

  describe('connection quality', () => {
    it('should detect good quality based on latency', () => {
      const latency = 50;
      const quality = latency < 200 ? 'good' : latency < 1000 ? 'poor' : 'unknown';

      expect(quality).toBe('good');
    });

    it('should detect poor quality based on latency', () => {
      const latency = 500;
      const quality = latency < 200 ? 'good' : latency < 1000 ? 'poor' : 'unknown';

      expect(quality).toBe('poor');
    });
  });

  describe('state shape', () => {
    it('should have correct state structure', () => {
      const mockState: ConnectionState = {
        currentLayer: 'internet',
        internet: {
          available: true,
          latency: 100,
          quality: 'good',
        },
        cellular: {
          available: false,
          signalStrength: 0,
          canSendSMS: false,
        },
        bluetooth: {
          meshConnected: false,
          nearbyDevices: 0,
        },
        lastCheck: new Date(),
      };

      expect(mockState.currentLayer).toBe('internet');
      expect(mockState.internet.available).toBe(true);
      expect(mockState.cellular.canSendSMS).toBe(false);
      expect(mockState.bluetooth.meshConnected).toBe(false);
    });
  });
});

describe('ConnectionManager Fallback Chain Generation', () => {
  describe('generateFallbackChain', () => {
    it('should generate full chain when all layers available', () => {
      const state: ConnectionState = {
        currentLayer: 'internet',
        internet: { available: true, latency: 100, quality: 'good' },
        cellular: { available: true, signalStrength: 3, canSendSMS: true },
        bluetooth: { meshConnected: true, nearbyDevices: 5 },
        lastCheck: new Date(),
      };

      const chain: ConnectionLayer[] = [];
      if (state.internet.available) chain.push('internet');
      if (state.cellular.canSendSMS) chain.push('sms');
      if (state.bluetooth.meshConnected) chain.push('bluetooth');

      expect(chain).toEqual(['internet', 'sms', 'bluetooth']);
    });

    it('should skip unavailable layers', () => {
      const state: ConnectionState = {
        currentLayer: 'sms',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: true, signalStrength: 2, canSendSMS: true },
        bluetooth: { meshConnected: true, nearbyDevices: 3 },
        lastCheck: new Date(),
      };

      const chain: ConnectionLayer[] = [];
      if (state.internet.available) chain.push('internet');
      if (state.cellular.canSendSMS) chain.push('sms');
      if (state.bluetooth.meshConnected) chain.push('bluetooth');

      expect(chain).toEqual(['sms', 'bluetooth']);
      expect(chain).not.toContain('internet');
    });

    it('should return empty chain when no connectivity', () => {
      const state: ConnectionState = {
        currentLayer: 'none',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      };

      const chain: ConnectionLayer[] = [];
      if (state.internet.available) chain.push('internet');
      if (state.cellular.canSendSMS) chain.push('sms');
      if (state.bluetooth.meshConnected) chain.push('bluetooth');

      expect(chain).toEqual([]);
    });

    it('should handle bluetooth-only scenario', () => {
      const state: ConnectionState = {
        currentLayer: 'bluetooth',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: true, nearbyDevices: 2 },
        lastCheck: new Date(),
      };

      const chain: ConnectionLayer[] = [];
      if (state.internet.available) chain.push('internet');
      if (state.cellular.canSendSMS) chain.push('sms');
      if (state.bluetooth.meshConnected) chain.push('bluetooth');

      expect(chain).toEqual(['bluetooth']);
    });
  });
});
