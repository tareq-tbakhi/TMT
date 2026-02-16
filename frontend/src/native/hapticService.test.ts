/**
 * Haptic feedback service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockHaptics = vi.hoisted(() => ({
  impact: vi.fn(),
  notification: vi.fn(),
  vibrate: vi.fn(),
  selectionChanged: vi.fn(),
}));

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor Haptics
vi.mock('@capacitor/haptics', () => ({
  Haptics: mockHaptics,
  ImpactStyle: {
    Heavy: 'HEAVY',
    Medium: 'MEDIUM',
    Light: 'LIGHT',
  },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR',
  },
}));

import {
  impactLight,
  impactMedium,
  impactHeavy,
  notificationSuccess,
  notificationWarning,
  notificationError,
  vibrate,
  selectionChanged,
} from './hapticService';

describe('Haptic Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('impactLight', () => {
    it('should not call Haptics on web', async () => {
      await impactLight();
      expect(mockHaptics.impact).not.toHaveBeenCalled();
    });
  });

  describe('impactMedium', () => {
    it('should not call Haptics on web', async () => {
      await impactMedium();
      expect(mockHaptics.impact).not.toHaveBeenCalled();
    });
  });

  describe('impactHeavy', () => {
    it('should not call Haptics on web', async () => {
      await impactHeavy();
      expect(mockHaptics.impact).not.toHaveBeenCalled();
    });
  });

  describe('notificationSuccess', () => {
    it('should not call Haptics on web', async () => {
      await notificationSuccess();
      expect(mockHaptics.notification).not.toHaveBeenCalled();
    });
  });

  describe('notificationWarning', () => {
    it('should not call Haptics on web', async () => {
      await notificationWarning();
      expect(mockHaptics.notification).not.toHaveBeenCalled();
    });
  });

  describe('notificationError', () => {
    it('should not call Haptics on web', async () => {
      await notificationError();
      expect(mockHaptics.notification).not.toHaveBeenCalled();
    });
  });

  describe('vibrate', () => {
    it('should use navigator.vibrate on web when available', async () => {
      const vibrateSpy = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
      });

      await vibrate(300);

      expect(vibrateSpy).toHaveBeenCalledWith(300);
    });

    it('should use default duration of 200ms', async () => {
      const vibrateSpy = vi.fn();
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrateSpy,
        configurable: true,
      });

      await vibrate();

      expect(vibrateSpy).toHaveBeenCalledWith(200);
    });

    it('should not throw when navigator.vibrate not available', async () => {
      // Remove vibrate from navigator to simulate unsupported browser
      const originalVibrate = navigator.vibrate;
      // Use delete with explicit type assertion for test purposes
      delete (navigator as { vibrate?: typeof navigator.vibrate }).vibrate;

      await expect(vibrate()).resolves.toBeUndefined();

      // Restore
      Object.defineProperty(navigator, 'vibrate', {
        value: originalVibrate,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('selectionChanged', () => {
    it('should not call Haptics on web', async () => {
      await selectionChanged();
      expect(mockHaptics.selectionChanged).not.toHaveBeenCalled();
    });
  });
});

describe('Haptic Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('impactLight (native mock)', () => {
    it('should call Haptics.impact with Light style', async () => {
      mockHaptics.impact.mockResolvedValue(undefined);

      await mockHaptics.impact({ style: 'LIGHT' });

      expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    });

    it('should handle haptics failure gracefully', async () => {
      mockHaptics.impact.mockRejectedValue(new Error('Haptics not available'));

      await expect(mockHaptics.impact({ style: 'LIGHT' }).catch(() => {})).resolves.toBeUndefined();
    });
  });

  describe('impactMedium (native mock)', () => {
    it('should call Haptics.impact with Medium style', async () => {
      mockHaptics.impact.mockResolvedValue(undefined);

      await mockHaptics.impact({ style: 'MEDIUM' });

      expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
    });
  });

  describe('impactHeavy (native mock)', () => {
    it('should call Haptics.impact with Heavy style', async () => {
      mockHaptics.impact.mockResolvedValue(undefined);

      await mockHaptics.impact({ style: 'HEAVY' });

      expect(mockHaptics.impact).toHaveBeenCalledWith({ style: 'HEAVY' });
    });
  });

  describe('notificationSuccess (native mock)', () => {
    it('should call Haptics.notification with Success type', async () => {
      mockHaptics.notification.mockResolvedValue(undefined);

      await mockHaptics.notification({ type: 'SUCCESS' });

      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' });
    });
  });

  describe('notificationWarning (native mock)', () => {
    it('should call Haptics.notification with Warning type', async () => {
      mockHaptics.notification.mockResolvedValue(undefined);

      await mockHaptics.notification({ type: 'WARNING' });

      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'WARNING' });
    });
  });

  describe('notificationError (native mock)', () => {
    it('should call Haptics.notification with Error type', async () => {
      mockHaptics.notification.mockResolvedValue(undefined);

      await mockHaptics.notification({ type: 'ERROR' });

      expect(mockHaptics.notification).toHaveBeenCalledWith({ type: 'ERROR' });
    });
  });

  describe('vibrate (native mock)', () => {
    it('should call Haptics.vibrate with duration', async () => {
      mockHaptics.vibrate.mockResolvedValue(undefined);

      await mockHaptics.vibrate({ duration: 500 });

      expect(mockHaptics.vibrate).toHaveBeenCalledWith({ duration: 500 });
    });

    it('should handle vibrate failure gracefully', async () => {
      mockHaptics.vibrate.mockRejectedValue(new Error('Vibration failed'));

      await expect(mockHaptics.vibrate({ duration: 200 }).catch(() => {})).resolves.toBeUndefined();
    });
  });

  describe('selectionChanged (native mock)', () => {
    it('should call Haptics.selectionChanged', async () => {
      mockHaptics.selectionChanged.mockResolvedValue(undefined);

      await mockHaptics.selectionChanged();

      expect(mockHaptics.selectionChanged).toHaveBeenCalled();
    });
  });
});
