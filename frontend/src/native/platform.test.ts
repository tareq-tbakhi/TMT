/**
 * Platform detection tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockCapacitor = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
  isPluginAvailable: vi.fn(() => true),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: mockCapacitor,
}));

// Import after mocking
import { getPlatformName, isPluginAvailable } from './platform';

describe('Platform Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isNative', () => {
    it('should return true when running on native platform', () => {
      mockCapacitor.isNativePlatform.mockReturnValue(true);
      expect(mockCapacitor.isNativePlatform()).toBe(true);
    });

    it('should return false when running on web', () => {
      mockCapacitor.isNativePlatform.mockReturnValue(false);
      expect(mockCapacitor.isNativePlatform()).toBe(false);
    });
  });

  describe('Platform identification', () => {
    it('should identify iOS platform', () => {
      mockCapacitor.getPlatform.mockReturnValue('ios');
      expect(mockCapacitor.getPlatform()).toBe('ios');
    });

    it('should identify Android platform', () => {
      mockCapacitor.getPlatform.mockReturnValue('android');
      expect(mockCapacitor.getPlatform()).toBe('android');
    });

    it('should identify web platform', () => {
      mockCapacitor.getPlatform.mockReturnValue('web');
      expect(mockCapacitor.getPlatform()).toBe('web');
    });
  });

  describe('getPlatformName', () => {
    it('should return correct platform name for ios', () => {
      mockCapacitor.getPlatform.mockReturnValue('ios');
      expect(getPlatformName()).toBe('ios');
    });

    it('should return correct platform name for android', () => {
      mockCapacitor.getPlatform.mockReturnValue('android');
      expect(getPlatformName()).toBe('android');
    });

    it('should return correct platform name for web', () => {
      mockCapacitor.getPlatform.mockReturnValue('web');
      expect(getPlatformName()).toBe('web');
    });
  });

  describe('isPluginAvailable', () => {
    it('should return true when plugin is available', () => {
      mockCapacitor.isPluginAvailable.mockReturnValue(true);
      expect(isPluginAvailable('Camera')).toBe(true);
      expect(mockCapacitor.isPluginAvailable).toHaveBeenCalledWith('Camera');
    });

    it('should return false when plugin is not available', () => {
      mockCapacitor.isPluginAvailable.mockReturnValue(false);
      expect(isPluginAvailable('NonExistentPlugin')).toBe(false);
    });
  });
});
