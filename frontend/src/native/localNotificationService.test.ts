/**
 * Local notification service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockLocalNotifications = vi.hoisted(() => ({
  schedule: vi.fn(),
  cancel: vi.fn(),
  getPending: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  addListener: vi.fn(),
}));

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor LocalNotifications
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: mockLocalNotifications,
}));

// Mock Web Notification API
const mockWebNotification = vi.fn() as unknown as typeof Notification & { permission: string; requestPermission: () => Promise<string> };
mockWebNotification.permission = 'default';
mockWebNotification.requestPermission = vi.fn().mockResolvedValue('granted');

Object.defineProperty(window, 'Notification', {
  value: mockWebNotification,
  configurable: true,
  writable: true,
});

import {
  showNotification,
  scheduleNotification,
  cancelNotification,
  cancelAllNotifications,
  getPendingNotifications,
  checkNotificationPermission,
  requestNotificationPermission,
  addNotificationListener,
  type LocalNotificationOptions,
} from './localNotificationService';

describe('Local Notification Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWebNotification.permission = 'default';
    (mockWebNotification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('granted');
  });

  describe('showNotification', () => {
    it('should use Web Notification API when permission granted', async () => {
      mockWebNotification.permission = 'granted';

      const options: LocalNotificationOptions = {
        title: 'Test Title',
        body: 'Test Body',
      };

      const id = await showNotification(options);

      expect(id).toBeDefined();
      expect(typeof id).toBe('number');
      expect(mockWebNotification).toHaveBeenCalledWith('Test Title', {
        body: 'Test Body',
        tag: expect.any(String),
      });
    });

    it('should request permission if not yet granted', async () => {
      mockWebNotification.permission = 'default';
      (mockWebNotification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('granted');

      const options: LocalNotificationOptions = {
        title: 'Request Test',
        body: 'Should request permission',
      };

      await showNotification(options);

      expect(mockWebNotification.requestPermission).toHaveBeenCalled();
    });

    it('should not show notification if permission denied', async () => {
      mockWebNotification.permission = 'denied';

      const options: LocalNotificationOptions = {
        title: 'Denied Test',
        body: 'Should not show',
      };

      const id = await showNotification(options);

      expect(id).toBeDefined();
    });

    it('should use provided ID or generate one', async () => {
      mockWebNotification.permission = 'granted';

      const options: LocalNotificationOptions = {
        id: 12345,
        title: 'Custom ID',
        body: 'With ID',
      };

      const id = await showNotification(options);

      expect(id).toBe(12345);
    });

    it('should generate ID based on timestamp if not provided', async () => {
      mockWebNotification.permission = 'granted';
      const beforeTime = Date.now();

      const options: LocalNotificationOptions = {
        title: 'Auto ID',
        body: 'Generated',
      };

      const id = await showNotification(options);
      const afterTime = Date.now();

      expect(id).toBeGreaterThanOrEqual(beforeTime);
      expect(id).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('scheduleNotification', () => {
    it('should schedule notification with specified time', async () => {
      mockWebNotification.permission = 'granted';
      const futureDate = new Date(Date.now() + 60000);

      const id = await scheduleNotification({
        title: 'Scheduled',
        body: 'For later',
        at: futureDate,
      });

      expect(id).toBeDefined();
    });
  });

  describe('cancelNotification', () => {
    it('should not throw on web', async () => {
      await expect(cancelNotification(123)).resolves.toBeUndefined();
    });
  });

  describe('cancelAllNotifications', () => {
    it('should not throw on web', async () => {
      await expect(cancelAllNotifications()).resolves.toBeUndefined();
    });
  });

  describe('getPendingNotifications', () => {
    it('should return empty array on web', async () => {
      const result = await getPendingNotifications();

      expect(result).toEqual([]);
    });
  });

  describe('checkNotificationPermission', () => {
    it('should return granted when Web Notification permission is granted', async () => {
      mockWebNotification.permission = 'granted';

      const result = await checkNotificationPermission();

      expect(result).toBe('granted');
    });

    it('should return denied when Web Notification permission is denied', async () => {
      mockWebNotification.permission = 'denied';

      const result = await checkNotificationPermission();

      expect(result).toBe('denied');
    });

    it('should return prompt when Web Notification permission is default', async () => {
      mockWebNotification.permission = 'default';

      const result = await checkNotificationPermission();

      expect(result).toBe('prompt');
    });
  });

  describe('requestNotificationPermission', () => {
    it('should return true when permission granted', async () => {
      (mockWebNotification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('granted');

      const result = await requestNotificationPermission();

      expect(result).toBe(true);
    });

    it('should return false when permission denied', async () => {
      (mockWebNotification.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue('denied');

      const result = await requestNotificationPermission();

      expect(result).toBe(false);
    });
  });

  describe('addNotificationListener', () => {
    it('should return a no-op cleanup function on web', () => {
      const callback = vi.fn();

      const cleanup = addNotificationListener(callback);

      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });
});

describe('Local Notification Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('showNotification (native mock)', () => {
    it('should call LocalNotifications.schedule', async () => {
      mockLocalNotifications.schedule.mockResolvedValue(undefined);

      await mockLocalNotifications.schedule({
        notifications: [{
          id: 123,
          title: 'Native Test',
          body: 'Native Body',
          schedule: { at: new Date() },
        }],
      });

      expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: expect.arrayContaining([
          expect.objectContaining({
            id: 123,
            title: 'Native Test',
            body: 'Native Body',
          }),
        ]),
      });
    });

    it('should schedule notification with custom schedule', async () => {
      mockLocalNotifications.schedule.mockResolvedValue(undefined);
      const scheduledTime = new Date(Date.now() + 3600000);

      await mockLocalNotifications.schedule({
        notifications: [{
          id: 456,
          title: 'Scheduled Native',
          body: 'Future notification',
          schedule: { at: scheduledTime },
        }],
      });

      expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: expect.arrayContaining([
          expect.objectContaining({
            schedule: expect.objectContaining({ at: scheduledTime }),
          }),
        ]),
      });
    });

    it('should support recurring notifications', async () => {
      mockLocalNotifications.schedule.mockResolvedValue(undefined);

      await mockLocalNotifications.schedule({
        notifications: [{
          id: 789,
          title: 'Recurring',
          body: 'Every hour',
          schedule: { every: 'hour', count: 10 },
        }],
      });

      expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
        notifications: expect.arrayContaining([
          expect.objectContaining({
            schedule: expect.objectContaining({ every: 'hour', count: 10 }),
          }),
        ]),
      });
    });
  });

  describe('cancelNotification (native mock)', () => {
    it('should call LocalNotifications.cancel with notification ID', async () => {
      mockLocalNotifications.cancel.mockResolvedValue(undefined);

      await mockLocalNotifications.cancel({ notifications: [{ id: 123 }] });

      expect(mockLocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: 123 }],
      });
    });
  });

  describe('cancelAllNotifications (native mock)', () => {
    it('should get pending and cancel all', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({
        notifications: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
      mockLocalNotifications.cancel.mockResolvedValue(undefined);

      const pending = await mockLocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await mockLocalNotifications.cancel({ notifications: pending.notifications });
      }

      expect(mockLocalNotifications.getPending).toHaveBeenCalled();
      expect(mockLocalNotifications.cancel).toHaveBeenCalledWith({
        notifications: [{ id: 1 }, { id: 2 }, { id: 3 }],
      });
    });

    it('should not call cancel if no pending notifications', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({ notifications: [] });

      const pending = await mockLocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await mockLocalNotifications.cancel({ notifications: pending.notifications });
      }

      expect(mockLocalNotifications.getPending).toHaveBeenCalled();
      expect(mockLocalNotifications.cancel).not.toHaveBeenCalled();
    });
  });

  describe('getPendingNotifications (native mock)', () => {
    it('should return pending notifications', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({
        notifications: [
          { id: 1, title: 'Pending 1', body: 'Body 1' },
          { id: 2, title: 'Pending 2', body: 'Body 2' },
        ],
      });

      const result = await mockLocalNotifications.getPending();

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0].title).toBe('Pending 1');
    });

    it('should return empty array when no pending', async () => {
      mockLocalNotifications.getPending.mockResolvedValue({ notifications: [] });

      const result = await mockLocalNotifications.getPending();

      expect(result.notifications).toEqual([]);
    });
  });

  describe('checkNotificationPermission (native mock)', () => {
    it('should return granted', async () => {
      mockLocalNotifications.checkPermissions.mockResolvedValue({ display: 'granted' });

      const result = await mockLocalNotifications.checkPermissions();

      expect(result.display).toBe('granted');
    });

    it('should return denied', async () => {
      mockLocalNotifications.checkPermissions.mockResolvedValue({ display: 'denied' });

      const result = await mockLocalNotifications.checkPermissions();

      expect(result.display).toBe('denied');
    });

    it('should return prompt', async () => {
      mockLocalNotifications.checkPermissions.mockResolvedValue({ display: 'prompt' });

      const result = await mockLocalNotifications.checkPermissions();

      expect(result.display).toBe('prompt');
    });
  });

  describe('requestNotificationPermission (native mock)', () => {
    it('should return granted permission', async () => {
      mockLocalNotifications.requestPermissions.mockResolvedValue({ display: 'granted' });

      const result = await mockLocalNotifications.requestPermissions();

      expect(result.display).toBe('granted');
    });

    it('should return denied permission', async () => {
      mockLocalNotifications.requestPermissions.mockResolvedValue({ display: 'denied' });

      const result = await mockLocalNotifications.requestPermissions();

      expect(result.display).toBe('denied');
    });
  });

  describe('addNotificationListener (native mock)', () => {
    it('should add listener for notification actions', async () => {
      const mockHandle = { remove: vi.fn() };
      mockLocalNotifications.addListener.mockResolvedValue(mockHandle);

      await mockLocalNotifications.addListener('localNotificationActionPerformed', vi.fn());

      expect(mockLocalNotifications.addListener).toHaveBeenCalledWith(
        'localNotificationActionPerformed',
        expect.any(Function)
      );
    });

    it('should call callback with action details', async () => {
      const callback = vi.fn();
      let actionCallback: ((action: { notification: { id: number; extra: Record<string, unknown> }; actionId: string }) => void) | null = null;

      mockLocalNotifications.addListener.mockImplementation((event, cb) => {
        if (event === 'localNotificationActionPerformed') {
          actionCallback = cb;
        }
        return Promise.resolve({ remove: vi.fn() });
      });

      await mockLocalNotifications.addListener('localNotificationActionPerformed', callback);

      if (actionCallback) {
        actionCallback({
          notification: { id: 123, extra: { action: 'open' } },
          actionId: 'tap',
        });
      }

      expect(callback).toHaveBeenCalledWith({
        notification: { id: 123, extra: { action: 'open' } },
        actionId: 'tap',
      });
    });

    it('should return cleanup function that removes listener', async () => {
      const removeFn = vi.fn().mockResolvedValue(undefined);
      mockLocalNotifications.addListener.mockResolvedValue({ remove: removeFn });

      const handle = await mockLocalNotifications.addListener(
        'localNotificationActionPerformed',
        vi.fn()
      );

      await handle.remove();

      expect(removeFn).toHaveBeenCalled();
    });
  });
});

describe('Notification options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should support sound option', async () => {
    mockLocalNotifications.schedule.mockResolvedValue(undefined);

    await mockLocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: 'With Sound',
        body: 'Custom sound',
        sound: 'alert.wav',
      }],
    });

    expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: expect.arrayContaining([
        expect.objectContaining({ sound: 'alert.wav' }),
      ]),
    });
  });

  it('should support icon options', async () => {
    mockLocalNotifications.schedule.mockResolvedValue(undefined);

    await mockLocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: 'With Icons',
        body: 'Custom icons',
        smallIcon: 'ic_stat_notification',
        largeIcon: 'ic_launcher',
      }],
    });

    expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: expect.arrayContaining([
        expect.objectContaining({
          smallIcon: 'ic_stat_notification',
          largeIcon: 'ic_launcher',
        }),
      ]),
    });
  });

  it('should support extra data', async () => {
    mockLocalNotifications.schedule.mockResolvedValue(undefined);

    await mockLocalNotifications.schedule({
      notifications: [{
        id: 1,
        title: 'With Extra',
        body: 'Extra data',
        extra: { sosId: 'sos-123', priority: 'high' },
      }],
    });

    expect(mockLocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: expect.arrayContaining([
        expect.objectContaining({
          extra: { sosId: 'sos-123', priority: 'high' },
        }),
      ]),
    });
  });
});
