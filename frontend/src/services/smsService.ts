/**
 * SMS encryption service for offline SOS.
 * Encrypts patient SOS data into a compact, encrypted SMS payload.
 *
 * SMS format: TMT:v1:<base64-encrypted-payload>
 * Decrypted payload: {"u":"P4821","l":"31.520,34.440","s":"T","v":"3","t":"1707753600","m":"abc123"}
 *
 * On Android, sends SMS silently via native SmsManager (no user interaction).
 * On web, falls back to sms: URI scheme.
 */

import { encrypt, deriveKey } from "../utils/encryption";
import { encodeLocation } from "../utils/locationCodec";
import { getPatientStatusShort } from "../utils/formatting";
import { SmsSender } from "../plugins/smsSender";

const SMS_PREFIX = "TMT:v1:";

export interface SOSPayload {
  patientId: string;
  latitude: number;
  longitude: number;
  status: string; // "safe", "injured", "trapped", "evacuate"
  severity: string; // "1" to "5"
  messageId?: string; // unique ID for dedup
}

/**
 * Builds the compact JSON payload for SMS.
 * Uses single-char keys to minimize SMS length:
 * - u: user/patient ID
 * - l: location (compact encoded)
 * - s: status short code
 * - v: severity
 * - t: timestamp (unix seconds)
 * - m: message ID (for dedup on backend)
 */
export function buildCompactPayload(payload: SOSPayload): string {
  const obj: Record<string, string> = {
    u: payload.patientId,
    l: encodeLocation(payload.latitude, payload.longitude),
    s: getPatientStatusShort(payload.status),
    v: payload.severity,
    t: Math.floor(Date.now() / 1000).toString(),
  };

  // Include messageId for dedup (short key to save SMS chars)
  if (payload.messageId) {
    // Use first 8 chars of UUID to stay compact
    obj.m = payload.messageId.replace(/-/g, "").substring(0, 8);
  }

  return JSON.stringify(obj);
}

/**
 * Encrypts an SOS payload for SMS transmission.
 * Returns the full SMS body with prefix.
 */
export async function encryptSOSPayload(
  patientId: string,
  latitude: number,
  longitude: number,
  status: string,
  severity: string,
  encryptionKey?: string,
  messageId?: string
): Promise<string> {
  const payload: SOSPayload = {
    patientId,
    latitude,
    longitude,
    status,
    severity,
    messageId,
  };

  const compactJson = buildCompactPayload(payload);

  // Derive key from patient's encryption key or use a default passphrase
  const keyPassphrase =
    encryptionKey || localStorage.getItem("tmt-sms-key") || patientId;
  const key = await deriveKey(keyPassphrase);

  const encrypted = await encrypt(compactJson, key);
  return `${SMS_PREFIX}${encrypted}`;
}

/**
 * Builds the complete SMS body ready for sending.
 * This is the same as encryptSOSPayload but with a clearer name for
 * use in the SMS fallback hook.
 */
export async function buildSMSBody(
  patientId: string,
  latitude: number,
  longitude: number,
  status: string,
  severity: string,
  encryptionKey?: string,
  messageId?: string
): Promise<string> {
  return encryptSOSPayload(
    patientId,
    latitude,
    longitude,
    status,
    severity,
    encryptionKey,
    messageId
  );
}

/**
 * Ensures SEND_SMS permission is granted on Android.
 * Requests permission if not already granted.
 * Returns true if permission is available.
 */
async function ensureSmsPermission(): Promise<boolean> {
  try {
    const status = await SmsSender.checkPermissions();
    if (status.sms === "granted") return true;

    const result = await SmsSender.requestPermissions();
    return result.sms === "granted";
  } catch {
    return false;
  }
}

/**
 * Sends SMS silently via native Android SmsManager.
 * Falls back to sms: URI scheme on web/unsupported platforms.
 */
export async function sendViaSMS(
  smsBody: string,
  recipientNumber: string
): Promise<boolean> {
  // Try native silent SMS first (Android)
  try {
    const availability = await SmsSender.isAvailable();

    if (availability.available) {
      // Ensure permission before sending
      if (!availability.permitted) {
        const granted = await ensureSmsPermission();
        if (!granted) {
          console.warn("[SMS] SEND_SMS permission denied, falling back to URI");
          return sendViaSMSUri(smsBody, recipientNumber);
        }
      }

      const result = await SmsSender.send({
        phoneNumber: recipientNumber,
        message: smsBody,
      });

      if (result.success) {
        console.log("[SMS] Sent silently via native SmsManager");
        return true;
      }

      console.warn("[SMS] Native send failed, falling back to URI");
    }
  } catch {
    // Native plugin not available (web platform) — fall through
  }

  // Fallback: sms: URI scheme (opens SMS app, requires user interaction)
  return sendViaSMSUri(smsBody, recipientNumber);
}

/**
 * Fallback: Opens the device SMS app with pre-filled SOS message.
 * Falls back to copying to clipboard if SMS URI is not supported.
 */
async function sendViaSMSUri(
  smsBody: string,
  recipientNumber: string
): Promise<boolean> {
  try {
    const encodedBody = encodeURIComponent(smsBody);
    const smsUri = `sms:${recipientNumber}?body=${encodedBody}`;
    window.location.href = smsUri;
    return true;
  } catch {
    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(smsBody);
      return true;
    } catch {
      return false;
    }
  }
}
