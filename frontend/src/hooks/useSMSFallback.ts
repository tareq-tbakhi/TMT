/**
 * SMS fallback hook for offline SOS.
 * Detects offline state and provides SMS-based SOS functionality.
 */

import { useState, useCallback } from "react";
import { useOffline } from "./useOffline";
import { useAuthStore } from "../store/authStore";
import { buildSMSBody, sendViaSMS } from "../services/smsService";
import { getCurrentPosition } from "../utils/locationCodec";

// Default TMT SMS gateway number (configured per deployment)
const SMS_GATEWAY_NUMBER =
  import.meta.env.VITE_SMS_GATEWAY_NUMBER || "+15551234567";

interface UseSMSFallbackReturn {
  /** Whether the device is offline */
  isOffline: boolean;
  /** Whether an SMS SOS is being prepared */
  isSending: boolean;
  /** Last error message */
  error: string | null;
  /** Whether SMS was successfully handed off to the SMS app */
  sent: boolean;
  /** Send an SOS via SMS */
  sendSOS: (status: string, severity: string) => Promise<boolean>;
}

export function useSMSFallback(): UseSMSFallbackReturn {
  const { isOffline } = useOffline();
  const user = useAuthStore((s) => s.user);

  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sendSOS = useCallback(
    async (status: string, severity: string): Promise<boolean> => {
      if (!user?.patientId) {
        setError("No patient ID found. Please log in.");
        return false;
      }

      setIsSending(true);
      setError(null);
      setSent(false);

      try {
        // Get current position
        let latitude: number;
        let longitude: number;

        try {
          const pos = await getCurrentPosition();
          latitude = pos.latitude;
          longitude = pos.longitude;
        } catch {
          // Fallback to last known position or default
          setError(
            "Could not get location. Please ensure location services are enabled."
          );
          setIsSending(false);
          return false;
        }

        // Build encrypted SMS body
        const smsBody = await buildSMSBody(
          user.patientId,
          latitude,
          longitude,
          status,
          severity
        );

        // Open SMS app with pre-filled message
        const success = await sendViaSMS(smsBody, SMS_GATEWAY_NUMBER);

        if (success) {
          setSent(true);
        } else {
          setError("Could not open SMS app. Please send manually.");
        }

        return success;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to prepare SOS SMS";
        setError(message);
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [user]
  );

  return {
    isOffline,
    isSending,
    error,
    sent,
    sendSOS,
  };
}
