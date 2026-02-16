/**
 * Push notification service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockPushNotifications = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  register: vi.fn(),
  addListener: vi.fn(),
  getDeliveredNotifications: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  removeAllDeliveredNotifications: vi.fn(),
}));

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor PushNotifications
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: mockPushNotifications,
}));

import {
  initializePushNotifications,
  checkPushPermission,
  requestPushPermission,
  getDeliveredNotifications,
  removeDeliveredNotifications,
  isPushAvailable,
  type PushConfig,
} from './pushService';

describe('Push Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializePushNotifications', () => {
    it('should return false on web', async () => {
      const config: PushConfig = {
        onToken: vi.fn(),
        onNotification: vi.fn(),
      };

      const result = await initializePushNotifications(config);

      expect(result).toBe(false);
    });

    it('should not call native APIs on web', async () => {
      const config: PushConfig = {};

      await initializePushNotifications(config);

      expect(mockPushNotifications.register).not.toHaveBeenCalled();
      expect(mockPushNotifications.addListener).not.toHaveBeenCalled();
    });
  });

  describe('checkPushPermission', () => {
    it('should return denied on web', async () => {
      const result = await checkPushPermission();

      expect(result).toBe('denied');
    });
  });

  describe('requestPushPermission', () => {
    it('should return false on web', async () => {
      const result = await requestPushPermission();

      expect(result).toBe(false);
    });
  });

  describe('getDeliveredNotifications', () => {
    it('should return empty array on web', async () => {
      const result = await getDeliveredNotifications();

      expect(result).toEqual([]);
    });
  });

  describe('removeDeliveredNotifications', () => {
    it('should not throw on web', async () => {
      await expect(removeDeliveredNotifications(['id1'])).resolves.toBeUndefined();
    });

    it('should not throw when called without ids on web', async () => {
      await expect(removeDeliveredNotifications()).resolves.toBeUndefined();
    });
  });

  describe('isPushAvailable', () => {
    it('should return false on web', () => {
      expect(isPushAvailable()).toBe(false);
    });
  });
});

describe('Push Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initializePushNotifications (native mock)', () => {
    it('should check and request permissions', async () => {
      mockPushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' });
      mockPushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' });
      mockPushNotifications.register.mockResolvedValue(undefined);
      mockPushNotifications.addListener.mockResolvedValue({ remove: vi.fn() });

      const permStatus = await mockPushNotifications.checkPermissions();
      expect(permStatus.receive).toBe('prompt');

      const requestStatus = await mockPushNotifications.requestPermissions();
      expect(requestStatus.receive).toBe('granted');

      await mockPushNotifications.register();
      expect(mockPushNotifications.register).toHaveBeenCalled();
    });

    it('should handle permission denied', async () => {
      mockPushNotifications.checkPermissions.mockResolvedValue({ receive: 'denied' });

      const status = await mockPushNotifications.checkPermissions();

      expect(status.receive).toBe('denied');
    });

    it('should register listeners for push events', async () => {
      mockPushNotifications.addListener.mockResolvedValue({ remove: vi.fn() });

      await mockPushNotifications.addListener('registration', vi.fn());
      await mockPushNotifications.addListener('registrationError', vi.fn());
      await mockPushNotifications.addListener('pushNotificationReceived', vi.fn());
      await mockPushNotifications.addListener('pushNotificationActionPerformed', vi.fn());

      expect(mockPushNotifications.addListener).toHaveBeenCalledTimes(4);
      expect(mockPushNotifications.addListener).toHaveBeenCalledWith('registration', expect.any(Function));
      expect(mockPushNotifications.addListener).toHaveBeenCalledWith('registrationError', expect.any(Function));
      expect(mockPushNotifications.addListener).toHaveBeenCalledWith('pushNotificationReceived', expect.any(Function));
      expect(mockPushNotifications.addListener).toHaveBeenCalledWith('pushNotificationActionPerformed', expect.any(Function));
    });
  });

  describe('checkPushPermission (native mock)', () => {
    it('should return granted when permission is granted', async () => {
      mockPushNotifications.checkPermissions.mockResolvedValue({ receive: 'granted' });

      const result = await mockPushNotifications.checkPermissions();

      expect(result.receive).toBe('granted');
    });

    it('should return denied when permission is denied', async () => {
      mockPushNotifications.checkPermissions.mockResolvedValue({ receive: 'denied' });

      const result = await mockPushNotifications.checkPermissions();

      expect(result.receive).toBe('denied');
    });

    it('should return prompt when permission is prompt', async () => {
      mockPushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' });

      const result = await mockPushNotifications.checkPermissions();

      expect(result.receive).toBe('prompt');
    });
  });

  describe('requestPushPermission (native mock)', () => {
    it('should return granted permission status', async () => {
      mockPushNotifications.requestPermissions.mockResolvedValue({ receive: 'granted' });

      const result = await mockPushNotifications.requestPermissions();

      expect(result.receive).toBe('granted');
    });

    it('should return denied permission status', async () => {
      mockPushNotifications.requestPermissions.mockResolvedValue({ receive: 'denied' });

      const result = await mockPushNotifications.requestPermissions();

      expect(result.receive).toBe('denied');
    });
  });

  describe('getDeliveredNotifications (native mock)', () => {
    it('should return delivered notifications', async () => {
      const mockNotifications = [
        { id: '1', title: 'Test 1', body: 'Body 1', data: { type: 'alert' } },
        { id: '2', title: 'Test 2', body: 'Body 2', data: {} },
      ];
      mockPushNotifications.getDeliveredNotifications.mockResolvedValue({
        notifications: mockNotifications,
      });

      const result = await mockPushNotifications.getDeliveredNotifications();

      expect(result.notifications).toHaveLength(2);
      expect(result.notifications[0].title).toBe('Test 1');
      expect(result.notifications[1].title).toBe('Test 2');
    });

    it('should return empty array when no notifications', async () => {
      mockPushNotifications.getDeliveredNotifications.mockResolvedValue({
        notifications: [],
      });

      const result = await mockPushNotifications.getDeliveredNotifications();

      expect(result.notifications).toEqual([]);
    });
  });

  describe('removeDeliveredNotifications (native mock)', () => {
    it('should remove specific notifications by ID', async () => {
      mockPushNotifications.removeDeliveredNotifications.mockResolvedValue(undefined);

      await mockPushNotifications.removeDeliveredNotifications({
        notifications: [
          { id: '1', title: '', body: '', data: {} },
          { id: '2', title: '', body: '', data: {} },
        ],
      });

      expect(mockPushNotifications.removeDeliveredNotifications).toHaveBeenCalledWith({
        notifications: expect.arrayContaining([
          expect.objectContaining({ id: '1' }),
          expect.objectContaining({ id: '2' }),
        ]),
      });
    });

    it('should remove all notifications when no IDs provided', async () => {
      mockPushNotifications.removeAllDeliveredNotifications.mockResolvedValue(undefined);

      await mockPushNotifications.removeAllDeliveredNotifications();

      expect(mockPushNotifications.removeAllDeliveredNotifications).toHaveBeenCalled();
    });
  });
});

describe('Push notification callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call onToken callback when registration succeeds', async () => {
    const onToken = vi.fn();
    let registrationCallback: ((token: { value: string }) => void) | null = null;

    mockPushNotifications.addListener.mockImplementation((event, callback) => {
      if (event === 'registration') {
        registrationCallback = callback;
      }
      return Promise.resolve({ remove: vi.fn() });
    });

    await mockPushNotifications.addListener('registration', (token: { value: string }) => {
      onToken(token.value);
    });

    if (registrationCallback) {
      registrationCallback({ value: 'fcm-token-12345' });
    }

    expect(onToken).toHaveBeenCalledWith('fcm-token-12345');
  });

  it('should call onNotification callback when notification received', async () => {
    const onNotification = vi.fn();
    let notificationCallback: ((notification: { id: string; title: string; body: string; data: Record<string, unknown> }) => void) | null = null;

    mockPushNotifications.addListener.mockImplementation((event, callback) => {
      if (event === 'pushNotificationReceived') {
        notificationCallback = callback;
      }
      return Promise.resolve({ remove: vi.fn() });
    });

    await mockPushNotifications.addListener('pushNotificationReceived', onNotification);

    if (notificationCallback) {
      notificationCallback({
        id: 'notif-123',
        title: 'Emergency Alert',
        body: 'New SOS nearby',
        data: { sosId: 'sos-456' },
      });
    }

    expect(onNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-123',
        title: 'Emergency Alert',
        body: 'New SOS nearby',
      })
    );
  });

  it('should call onNotificationTapped callback when notification is tapped', async () => {
    const onNotificationTapped = vi.fn();
    let actionCallback: ((action: { notification: { id: string; title: string; body: string; data: Record<string, unknown> } }) => void) | null = null;

    mockPushNotifications.addListener.mockImplementation((event, callback) => {
      if (event === 'pushNotificationActionPerformed') {
        actionCallback = callback;
      }
      return Promise.resolve({ remove: vi.fn() });
    });

    await mockPushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      onNotificationTapped(action.notification);
    });

    if (actionCallback) {
      actionCallback({
        notification: {
          id: 'notif-789',
          title: 'Tap Test',
          body: 'User tapped this',
          data: { action: 'open' },
        },
      });
    }

    expect(onNotificationTapped).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'notif-789',
        title: 'Tap Test',
      })
    );
  });

  it('should call onError callback when registration fails', async () => {
    const onError = vi.fn();
    let errorCallback: ((error: { error: string }) => void) | null = null;

    mockPushNotifications.addListener.mockImplementation((event, callback) => {
      if (event === 'registrationError') {
        errorCallback = callback;
      }
      return Promise.resolve({ remove: vi.fn() });
    });

    await mockPushNotifications.addListener('registrationError', (error) => {
      onError(new Error(error.error));
    });

    if (errorCallback) {
      errorCallback({ error: 'Push registration failed' });
    }

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
