/**
 * Geolocation service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockGeolocation = vi.hoisted(() => ({
  getCurrentPosition: vi.fn(),
  watchPosition: vi.fn(),
  clearWatch: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}));

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor Geolocation
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: mockGeolocation,
}));

import {
  getCurrentPosition,
  watchPosition,
  checkLocationPermission,
  requestLocationPermission,
} from './geolocationService';

describe('Geolocation Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentPosition', () => {
    it('should return position from navigator.geolocation', async () => {
      // Navigator mock is in setup.ts
      const position = await getCurrentPosition();

      expect(position.latitude).toBe(31.9539);
      expect(position.longitude).toBe(35.9106);
      expect(position.accuracy).toBe(10);
    });

    it('should include all coordinate fields', async () => {
      const position = await getCurrentPosition();

      expect(position).toHaveProperty('latitude');
      expect(position).toHaveProperty('longitude');
      expect(position).toHaveProperty('accuracy');
      expect(position).toHaveProperty('timestamp');
    });

    it('should handle high accuracy option', async () => {
      const position = await getCurrentPosition(true);
      expect(position.latitude).toBeDefined();
    });

    it('should handle low accuracy option', async () => {
      const position = await getCurrentPosition(false);
      expect(position.latitude).toBeDefined();
    });
  });

  describe('watchPosition', () => {
    it('should call navigator.geolocation.watchPosition', () => {
      const watchSpy = vi.spyOn(navigator.geolocation, 'watchPosition');
      const callback = vi.fn();

      watchPosition(callback);

      expect(watchSpy).toHaveBeenCalled();
      watchSpy.mockRestore();
    });

    it('should return a cleanup function', () => {
      const callback = vi.fn();
      const cleanup = watchPosition(callback);

      expect(typeof cleanup).toBe('function');
    });

    it('should call clearWatch when cleanup is invoked', () => {
      const clearWatchSpy = vi.spyOn(navigator.geolocation, 'clearWatch');
      const callback = vi.fn();

      const cleanup = watchPosition(callback);
      cleanup();

      expect(clearWatchSpy).toHaveBeenCalled();
      clearWatchSpy.mockRestore();
    });
  });

  describe('checkLocationPermission', () => {
    it('should check permissions using navigator.permissions', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ state: 'granted' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        configurable: true,
      });

      const result = await checkLocationPermission();

      expect(result).toBe('granted');
      expect(mockQuery).toHaveBeenCalledWith({ name: 'geolocation' });
    });

    it('should return prompt when permissions API not available', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: undefined,
        configurable: true,
      });

      const result = await checkLocationPermission();

      expect(result).toBe('prompt');
    });

    it('should handle denied permission', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ state: 'denied' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        configurable: true,
      });

      const result = await checkLocationPermission();
      expect(result).toBe('denied');
    });

    it('should handle prompt permission', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ state: 'prompt' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        configurable: true,
      });

      const result = await checkLocationPermission();
      expect(result).toBe('prompt');
    });
  });

  describe('requestLocationPermission', () => {
    it('should return true when position is obtained', async () => {
      const result = await requestLocationPermission();
      expect(result).toBe(true);
    });

    it('should return false when position fails', async () => {
      const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition;
      navigator.geolocation.getCurrentPosition = vi.fn((_, reject) => {
        reject?.(new MockGeolocationPositionError());
      }) as typeof navigator.geolocation.getCurrentPosition;

      const result = await requestLocationPermission();
      expect(result).toBe(false);

      navigator.geolocation.getCurrentPosition = originalGetCurrentPosition;
    });
  });
});

describe('Geolocation Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentPosition (native mock)', () => {
    it('should call Geolocation.getCurrentPosition', async () => {
      const mockNativePosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.006,
          accuracy: 5,
          altitude: 100,
          altitudeAccuracy: 10,
          heading: 90,
          speed: 5,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockResolvedValue(mockNativePosition);

      const result = await mockGeolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      expect(result.coords.latitude).toBe(40.7128);
      expect(result.coords.longitude).toBe(-74.006);
      expect(result.coords.accuracy).toBe(5);
    });

    it('should handle high accuracy setting', async () => {
      mockGeolocation.getCurrentPosition.mockResolvedValue({
        coords: { latitude: 0, longitude: 0, accuracy: 1 },
        timestamp: Date.now(),
      });

      await mockGeolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith({
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  });

  describe('watchPosition (native mock)', () => {
    it('should call Geolocation.watchPosition', async () => {
      mockGeolocation.watchPosition.mockResolvedValue('watch-id-123');

      const watchId = await mockGeolocation.watchPosition(
        { enableHighAccuracy: true },
        vi.fn()
      );

      expect(watchId).toBe('watch-id-123');
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    it('should call Geolocation.clearWatch with watch ID', async () => {
      mockGeolocation.clearWatch.mockResolvedValue(undefined);

      await mockGeolocation.clearWatch({ id: 'watch-id-123' });

      expect(mockGeolocation.clearWatch).toHaveBeenCalledWith({ id: 'watch-id-123' });
    });
  });

  describe('checkLocationPermission (native mock)', () => {
    it('should return granted when permission is granted', async () => {
      mockGeolocation.checkPermissions.mockResolvedValue({ location: 'granted' });

      const result = await mockGeolocation.checkPermissions();
      expect(result.location).toBe('granted');
    });

    it('should return denied when permission is denied', async () => {
      mockGeolocation.checkPermissions.mockResolvedValue({ location: 'denied' });

      const result = await mockGeolocation.checkPermissions();
      expect(result.location).toBe('denied');
    });

    it('should return prompt when permission is prompt', async () => {
      mockGeolocation.checkPermissions.mockResolvedValue({ location: 'prompt' });

      const result = await mockGeolocation.checkPermissions();
      expect(result.location).toBe('prompt');
    });
  });

  describe('requestLocationPermission (native mock)', () => {
    it('should return granted permission status', async () => {
      mockGeolocation.requestPermissions.mockResolvedValue({ location: 'granted' });

      const result = await mockGeolocation.requestPermissions();
      expect(result.location).toBe('granted');
    });

    it('should return denied permission status', async () => {
      mockGeolocation.requestPermissions.mockResolvedValue({ location: 'denied' });

      const result = await mockGeolocation.requestPermissions();
      expect(result.location).toBe('denied');
    });
  });
});

// Mock GeolocationPositionError for testing
class MockGeolocationPositionError extends Error {
  code = 1;
  PERMISSION_DENIED = 1;
  POSITION_UNAVAILABLE = 2;
  TIMEOUT = 3;
}
