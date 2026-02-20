/**
 * SmsSender Capacitor Plugin - Type Definitions
 *
 * Native SMS sending for offline SOS delivery.
 * Sends SMS silently via Android SmsManager — no user interaction.
 */

export interface SmsSenderPlugin {
  /**
   * Send an SMS silently in the background.
   * Requires SEND_SMS permission.
   */
  send(options: SmsSendOptions): Promise<SmsSendResult>;

  /**
   * Check if SMS sending is available on this device.
   */
  isAvailable(): Promise<SmsAvailability>;

  /**
   * Request SEND_SMS permission.
   */
  requestPermissions(): Promise<SmsPermissionStatus>;

  /**
   * Check current SEND_SMS permission status.
   */
  checkPermissions(): Promise<SmsPermissionStatus>;
}

export interface SmsSendOptions {
  /** Recipient phone number (E.164 format recommended, e.g. +970599000000) */
  phoneNumber: string;
  /** SMS message body */
  message: string;
}

export interface SmsSendResult {
  /** Whether the SMS was handed off to the carrier */
  success: boolean;
  /** The phone number it was sent to */
  phoneNumber: string;
  /** Error code if failed */
  errorCode?: number;
}

export interface SmsAvailability {
  /** Whether the device has telephony hardware */
  available: boolean;
  /** Whether SEND_SMS permission is granted */
  permitted: boolean;
}

export interface SmsPermissionStatus {
  /** SEND_SMS permission state */
  sms: 'granted' | 'denied' | 'prompt';
}
