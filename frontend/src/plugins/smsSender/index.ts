/**
 * SmsSender Capacitor Plugin - Main Entry Point
 *
 * Registers the SmsSender plugin with Capacitor and exports types.
 */

import { registerPlugin } from '@capacitor/core';
import type { SmsSenderPlugin } from './definitions';

/**
 * SmsSender plugin instance
 *
 * On native (Android), sends SMS silently via SmsManager.
 * On web, falls back to sms: URI scheme (opens default SMS app).
 */
const SmsSender = registerPlugin<SmsSenderPlugin>('SmsSender', {
  web: () => import('./web').then((m) => new m.SmsSenderWeb()),
});

export * from './definitions';
export { SmsSender };
