/**
 * SmsSender Web Implementation (Fallback)
 *
 * On web/desktop, native SMS sending isn't available.
 * Falls back to sms: URI scheme to open the device's default SMS app,
 * or copies to clipboard as last resort.
 */

import { WebPlugin } from '@capacitor/core';
import type {
  SmsSenderPlugin,
  SmsSendOptions,
  SmsSendResult,
  SmsAvailability,
  SmsPermissionStatus,
} from './definitions';

export class SmsSenderWeb extends WebPlugin implements SmsSenderPlugin {
  async send(options: SmsSendOptions): Promise<SmsSendResult> {
    console.warn('SmsSender: Native SMS not available on web. Falling back to sms: URI.');

    try {
      // Try sms: URI scheme to open native SMS app
      const encodedBody = encodeURIComponent(options.message);
      const smsUri = `sms:${options.phoneNumber}?body=${encodedBody}`;
      window.location.href = smsUri;
      return { success: true, phoneNumber: options.phoneNumber };
    } catch {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(options.message);
        console.warn('SmsSender: SMS body copied to clipboard as fallback.');
        return { success: true, phoneNumber: options.phoneNumber };
      } catch {
        return { success: false, phoneNumber: options.phoneNumber };
      }
    }
  }

  async isAvailable(): Promise<SmsAvailability> {
    return {
      available: false,
      permitted: false,
    };
  }

  async requestPermissions(): Promise<SmsPermissionStatus> {
    return { sms: 'denied' };
  }

  async checkPermissions(): Promise<SmsPermissionStatus> {
    return { sms: 'denied' };
  }
}
