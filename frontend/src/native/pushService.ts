/**
 * Push notifications service - handles FCM/APNS push notifications
 */

import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from '@capacitor/push-notifications';
import { isNative } from './platform';

export interface PushNotificationPayload {
  id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushConfig {
  onToken?: (token: string) => void;
  onNotification?: (notification: PushNotificationPayload) => void;
  onNotificationTapped?: (notification: PushNotificationPayload) => void;
  onError?: (error: Error) => void;
}

let isInitialized = false;

/**
 * Initialize push notifications
 */
export async function initializePushNotifications(config: PushConfig): Promise<boolean> {
  if (!isNative) {
    console.log('Push notifications not available on web');
    return false;
  }

  if (isInitialized) {
    console.warn('Push notifications already initialized');
    return true;
  }

  try {
    // Check permission
    let permissionStatus = await PushNotifications.checkPermissions();

    if (permissionStatus.receive !== 'granted') {
      permissionStatus = await PushNotifications.requestPermissions();
    }

    if (permissionStatus.receive !== 'granted') {
      console.warn('Push notification permission denied');
      return false;
    }

    // Register for push
    await PushNotifications.register();

    // Handle registration success
    PushNotifications.addListener('registration', (token: Token) => {
      console.log('Push registration success:', token.value);
      config.onToken?.(token.value);
    });

    // Handle registration errors
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
      config.onError?.(new Error(error.error));
    });

    // Handle incoming notifications (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
      config.onNotification?.({
        id: notification.id || crypto.randomUUID(),
        title: notification.title || '',
        body: notification.body || '',
        data: notification.data
      });
    });

    // Handle notification tap
    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      config.onNotificationTapped?.({
        id: action.notification.id || crypto.randomUUID(),
        title: action.notification.title || '',
        body: action.notification.body || '',
        data: action.notification.data
      });
    });

    isInitialized = true;
    return true;
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
    config.onError?.(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Check push notification permission
 */
export async function checkPushPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNative) {
    return 'denied';
  }

  const status = await PushNotifications.checkPermissions();
  if (status.receive === 'granted') return 'granted';
  if (status.receive === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Request push notification permission
 */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative) {
    return false;
  }

  const status = await PushNotifications.requestPermissions();
  return status.receive === 'granted';
}

/**
 * Get delivered notifications (shown in notification center)
 */
export async function getDeliveredNotifications(): Promise<PushNotificationPayload[]> {
  if (!isNative) {
    return [];
  }

  const { notifications } = await PushNotifications.getDeliveredNotifications();
  return notifications.map(n => ({
    id: n.id || crypto.randomUUID(),
    title: n.title || '',
    body: n.body || '',
    data: n.data
  }));
}

/**
 * Remove delivered notifications
 */
export async function removeDeliveredNotifications(ids?: string[]): Promise<void> {
  if (!isNative) {
    return;
  }

  if (ids && ids.length > 0) {
    await PushNotifications.removeDeliveredNotifications({
      notifications: ids.map(id => ({ id, title: '', body: '', data: {} }))
    });
  } else {
    await PushNotifications.removeAllDeliveredNotifications();
  }
}

/**
 * Check if push notifications are available
 */
export function isPushAvailable(): boolean {
  return isNative;
}
