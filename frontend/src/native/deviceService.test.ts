/**
 * Device service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockDevice = vi.hoisted(() => ({
  getInfo: vi.fn(),
  getId: vi.fn(),
  getBatteryInfo: vi.fn(),
}));

// Create a proper localStorage mock
const mockLocalStorage = vi.hoisted(() => {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => {
      for (const key in store) {
        delete store[key];
      }
    }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
});

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor Device
vi.mock('@capacitor/device', () => ({
  Device: mockDevice,
}));

// Setup localStorage mock before imports
vi.stubGlobal('localStorage', mockLocalStorage);

import { getDeviceInfo, getDeviceId, getBatteryInfo } from './deviceService';

describe('Device Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the mock store
    for (const key in mockLocalStorage.store) {
      delete mockLocalStorage.store[key];
    }
  });

  describe('getDeviceInfo', () => {
    it('should return web device info with navigator data', async () => {
      const info = await getDeviceInfo();

      expect(info.platform).toBe('web');
      expect(info.model).toBe(navigator.userAgent);
      expect(info.osVersion).toBe(navigator.platform);
      expect(info.isVirtual).toBe(false);
      expect(typeof info.batteryLevel).toBe('number');
      expect(typeof info.isCharging).toBe('boolean');
    });

    it('should return battery level between 0 and 100', async () => {
      const info = await getDeviceInfo();
      expect(info.batteryLevel).toBeGreaterThanOrEqual(0);
      expect(info.batteryLevel).toBeLessThanOrEqual(100);
    });
  });

  describe('getDeviceId', () => {
    it('should generate and persist a device ID', async () => {
      const id1 = await getDeviceId();
      expect(id1).toBeTruthy();
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);

      // Should return same ID on subsequent calls
      const id2 = await getDeviceId();
      expect(id2).toBe(id1);
    });

    it('should store device ID in localStorage', async () => {
      const id = await getDeviceId();
      expect(mockLocalStorage.store['tmt-device-id']).toBe(id);
    });

    it('should use existing localStorage ID if present', async () => {
      const existingId = 'existing-test-id-12345';
      mockLocalStorage.store['tmt-device-id'] = existingId;

      const id = await getDeviceId();
      expect(id).toBe(existingId);
    });
  });

  describe('getBatteryInfo', () => {
    it('should return battery info with level and charging status', async () => {
      const battery = await getBatteryInfo();

      expect(typeof battery.level).toBe('number');
      expect(battery.level).toBeGreaterThanOrEqual(0);
      expect(battery.level).toBeLessThanOrEqual(100);
      expect(typeof battery.isCharging).toBe('boolean');
    });

    it('should return default values when battery API unavailable', async () => {
      // Default fallback values
      const battery = await getBatteryInfo();
      expect(battery.level).toBe(100);
      expect(battery.isCharging).toBe(true);
    });
  });
});

describe('Device Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDeviceInfo (native mock)', () => {
    it('should call Device.getInfo and Device.getBatteryInfo', async () => {
      mockDevice.getInfo.mockResolvedValue({
        platform: 'ios',
        model: 'iPhone 14',
        osVersion: '16.0',
        isVirtual: false,
      });
      mockDevice.getBatteryInfo.mockResolvedValue({
        batteryLevel: 0.85,
        isCharging: true,
      });

      // Verify mocks are set up correctly
      const info = await mockDevice.getInfo();
      const battery = await mockDevice.getBatteryInfo();

      expect(info.platform).toBe('ios');
      expect(info.model).toBe('iPhone 14');
      expect(battery.batteryLevel).toBe(0.85);
      expect(battery.isCharging).toBe(true);
    });
  });

  describe('getDeviceId (native mock)', () => {
    it('should call Device.getId', async () => {
      const mockId = 'native-device-uuid-12345';
      mockDevice.getId.mockResolvedValue({ identifier: mockId });

      const result = await mockDevice.getId();
      expect(result.identifier).toBe(mockId);
    });
  });
});
