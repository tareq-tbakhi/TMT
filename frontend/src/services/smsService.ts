/**
 * SMS encryption service for offline SOS.
 * Encrypts patient SOS data into a compact, encrypted SMS payload.
 *
 * SMS format: TMT:v1:<base64-encrypted-payload>
 * Decrypted payload: {"u":"P4821","l":"31.520,34.440","s":"T","v":"3","t":"1707753600"}
 */

import { encrypt, deriveKey } from "../utils/encryption";
import { encodeLocation } from "../utils/locationCodec";
import { getPatientStatusShort } from "../utils/formatting";

const SMS_PREFIX = "TMT:v1:";

export interface SOSPayload {
  patientId: string;
  latitude: number;
  longitude: number;
  status: string; // "safe", "injured", "trapped", "evacuate"
  severity: string; // "1" to "5"
}

/**
 * Builds the compact JSON payload for SMS.
 * Uses single-char keys to minimize SMS length:
 * - u: user/patient ID
 * - l: location (compact encoded)
 * - s: status short code
 * - v: severity
 * - t: timestamp (unix seconds)
 */
export function buildCompactPayload(payload: SOSPayload): string {
  return JSON.stringify({
    u: payload.patientId,
    l: encodeLocation(payload.latitude, payload.longitude),
    s: getPatientStatusShort(payload.status),
    v: payload.severity,
    t: Math.floor(Date.now() / 1000).toString(),
  });
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
  encryptionKey?: string
): Promise<string> {
  const payload: SOSPayload = {
    patientId,
    latitude,
    longitude,
    status,
    severity,
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
  encryptionKey?: string
): Promise<string> {
  return encryptSOSPayload(
    patientId,
    latitude,
    longitude,
    status,
    severity,
    encryptionKey
  );
}

/**
 * Opens the device SMS app with pre-filled SOS message.
 * Falls back to copying to clipboard if SMS URI is not supported.
 */
export async function sendViaSMS(
  smsBody: string,
  recipientNumber: string
): Promise<boolean> {
  try {
    // Use sms: URI scheme to open native SMS app
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
