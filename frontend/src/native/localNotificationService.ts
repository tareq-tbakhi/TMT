/**
 * Local notifications service - for device-local notifications
 */

import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { isNative } from './platform';

export interface LocalNotificationOptions {
  id?: number;
  title: string;
  body: string;
  sound?: string;
  smallIcon?: string;
  largeIcon?: string;
  schedule?: {
    at?: Date;
    every?: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';
    count?: number;
  };
  extra?: Record<string, unknown>;
}

/**
 * Show a local notification immediately
 */
export async function showNotification(options: LocalNotificationOptions): Promise<number> {
  const id = options.id ?? Date.now();

  if (!isNative) {
    // Web fallback using Notification API
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(options.title, {
          body: options.body,
          tag: String(id)
        });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification(options.title, {
            body: options.body,
            tag: String(id)
          });
        }
      }
    }
    return id;
  }

  const notification: LocalNotificationSchema = {
    id,
    title: options.title,
    body: options.body,
    schedule: options.schedule ? {
      at: options.schedule.at,
      every: options.schedule.every,
      count: options.schedule.count
    } : { at: new Date(Date.now() + 100) },
    sound: options.sound,
    smallIcon: options.smallIcon,
    largeIcon: options.largeIcon,
    extra: options.extra
  };

  await LocalNotifications.schedule({ notifications: [notification] });
  return id;
}

/**
 * Schedule a notification for later
 */
export async function scheduleNotification(options: LocalNotificationOptions & { at: Date }): Promise<number> {
  return showNotification({
    ...options,
    schedule: { at: options.at }
  });
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(id: number): Promise<void> {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id }] });
}

/**
 * Cancel all pending notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  if (!isNative) return;
  const { notifications } = await LocalNotifications.getPending();
  if (notifications.length > 0) {
    await LocalNotifications.cancel({ notifications });
  }
}

/**
 * Get pending notifications
 */
export async function getPendingNotifications(): Promise<Array<{ id: number; title: string; body: string }>> {
  if (!isNative) return [];

  const { notifications } = await LocalNotifications.getPending();
  return notifications.map(n => ({
    id: n.id,
    title: n.title,
    body: n.body
  }));
}

/**
 * Check local notification permission
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNative) {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      return 'prompt';
    }
    return 'denied';
  }

  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'granted') return 'granted';
  if (status.display === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Request local notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  const status = await LocalNotifications.requestPermissions();
  return status.display === 'granted';
}

/**
 * Add notification action listener
 */
export function addNotificationListener(
  callback: (notification: { id: number; actionId: string; extra?: Record<string, unknown> }) => void
): () => void {
  if (!isNative) {
    return () => {}; // No-op on web
  }

  let listenerHandle: { remove: () => Promise<void> } | null = null;

  LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    callback({
      id: action.notification.id,
      actionId: action.actionId,
      extra: action.notification.extra
    });
  }).then(handle => {
    listenerHandle = handle;
  });

  return () => {
    listenerHandle?.remove();
  };
}
