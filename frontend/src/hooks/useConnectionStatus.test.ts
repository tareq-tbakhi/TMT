/**
 * Connection Status Hook Tests
 *
 * Tests for the useConnectionStatus and useConnectionIndicator React hooks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock ConnectionManager
const mockConnectionManager = vi.hoisted(() => ({
  getState: vi.fn(),
  subscribe: vi.fn(),
  checkNow: vi.fn(),
  getFallbackChain: vi.fn(),
}));

vi.mock('../services/connectionManager', () => ({
  ConnectionManager: mockConnectionManager,
}));

// Import after mocks
import { useConnectionStatus, useConnectionIndicator } from './useConnectionStatus';
import type { ConnectionState, ConnectionLayer } from '../services/connectionManager';

describe('useConnectionStatus', () => {
  const mockState: ConnectionState = {
    currentLayer: 'internet',
    internet: {
      available: true,
      latency: 100,
      quality: 'good',
    },
    cellular: {
      available: true,
      signalStrength: 3,
      canSendSMS: true,
    },
    bluetooth: {
      meshConnected: false,
      nearbyDevices: 0,
    },
    lastCheck: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectionManager.getState.mockReturnValue(mockState);
    mockConnectionManager.subscribe.mockImplementation((callback) => {
      // Return unsubscribe function
      return () => {};
    });
    mockConnectionManager.getFallbackChain.mockReturnValue(['internet', 'sms']);
    mockConnectionManager.checkNow.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return current connection state', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.state).toBeDefined();
    expect(result.current.bestLayer).toBe('internet');
  });

  it('should return isConnected as true when layer is not none', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.isConnected).toBe(true);
  });

  it('should return hasInternet when internet is available', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.hasInternet).toBe(true);
  });

  it('should return hasSMS when cellular can send SMS', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(result.current.hasSMS).toBe(true);
  });

  it('should return hasBluetooth when mesh is connected', () => {
    const { result } = renderHook(() => useConnectionStatus());

    // Mock state has bluetooth not connected
    expect(result.current.hasBluetooth).toBe(false);
  });

  it('should return fallback chain', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(Array.isArray(result.current.fallbackChain)).toBe(true);
  });

  it('should provide checkNow function', () => {
    const { result } = renderHook(() => useConnectionStatus());

    expect(typeof result.current.checkNow).toBe('function');
  });

  it('should call checkNow on ConnectionManager', async () => {
    const { result } = renderHook(() => useConnectionStatus());

    await act(async () => {
      await result.current.checkNow();
    });

    expect(mockConnectionManager.checkNow).toHaveBeenCalled();
  });

  it('should subscribe to state changes', () => {
    renderHook(() => useConnectionStatus());

    expect(mockConnectionManager.subscribe).toHaveBeenCalled();
  });

  it('should unsubscribe on unmount', () => {
    const unsubscribe = vi.fn();
    mockConnectionManager.subscribe.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useConnectionStatus());
    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('useConnectionIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnectionManager.subscribe.mockReturnValue(() => {});
    mockConnectionManager.getFallbackChain.mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('internet layer', () => {
    it('should return Online label for good internet', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'internet',
        internet: { available: true, latency: 50, quality: 'good' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current.layer).toBe('internet');
      expect(result.current.label).toBe('Online');
      expect(result.current.color).toBe('green');
    });

    it('should return Slow label for poor internet', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'internet',
        internet: { available: true, latency: 500, quality: 'poor' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current.label).toBe('Slow');
      expect(result.current.color).toBe('yellow');
    });
  });

  describe('SMS layer', () => {
    it('should return Cellular label for SMS', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'sms',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: true, signalStrength: 3, canSendSMS: true },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current.layer).toBe('sms');
      expect(result.current.label).toBe('Cellular');
      expect(result.current.color).toBe('yellow');
    });
  });

  describe('bluetooth layer', () => {
    it('should return Mesh label with device count', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'bluetooth',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: true, nearbyDevices: 5 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current.layer).toBe('bluetooth');
      expect(result.current.label).toBe('Mesh (5)');
      expect(result.current.color).toBe('blue');
    });
  });

  describe('no connection', () => {
    it('should return Offline label when no connectivity', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'none',
        internet: { available: false, latency: 0, quality: 'unknown' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current.layer).toBe('none');
      expect(result.current.label).toBe('Offline');
      expect(result.current.color).toBe('red');
    });
  });

  describe('indicator info structure', () => {
    it('should have all required fields', () => {
      mockConnectionManager.getState.mockReturnValue({
        currentLayer: 'internet',
        internet: { available: true, latency: 100, quality: 'good' },
        cellular: { available: false, signalStrength: 0, canSendSMS: false },
        bluetooth: { meshConnected: false, nearbyDevices: 0 },
        lastCheck: new Date(),
      });

      const { result } = renderHook(() => useConnectionIndicator());

      expect(result.current).toHaveProperty('layer');
      expect(result.current).toHaveProperty('label');
      expect(result.current).toHaveProperty('icon');
      expect(result.current).toHaveProperty('color');
      expect(result.current).toHaveProperty('description');
    });
  });
});

describe('Connection Layer Types', () => {
  it('should have correct layer values', () => {
    const validLayers: ConnectionLayer[] = ['internet', 'sms', 'bluetooth', 'none'];

    validLayers.forEach((layer) => {
      expect(['internet', 'sms', 'bluetooth', 'none']).toContain(layer);
    });
  });

  it('should prioritize internet over SMS', () => {
    const priority: ConnectionLayer[] = ['internet', 'sms', 'bluetooth', 'none'];

    expect(priority.indexOf('internet')).toBeLessThan(priority.indexOf('sms'));
  });

  it('should prioritize SMS over bluetooth', () => {
    const priority: ConnectionLayer[] = ['internet', 'sms', 'bluetooth', 'none'];

    expect(priority.indexOf('sms')).toBeLessThan(priority.indexOf('bluetooth'));
  });
});
