/**
 * Custom hook for managing conversation timeouts
 */

import { useEffect, useRef, useCallback } from "react";
import { SOS_CONFIG } from "../config/sosConfig";

interface UseConversationTimerOptions {
  isActive: boolean;
  onFirstReminder: () => void;
  onAutoSend: () => void;
  onMaxTime: () => void;
}

export function useConversationTimer({
  isActive,
  onFirstReminder,
  onAutoSend,
  onMaxTime,
}: UseConversationTimerOptions) {
  const secondsSinceLastResponse = useRef(0);
  const totalSeconds = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasShownReminder = useRef(false);

  const resetResponseTimer = useCallback(() => {
    secondsSinceLastResponse.current = 0;
    hasShownReminder.current = false;
  }, []);

  const resetAll = useCallback(() => {
    secondsSinceLastResponse.current = 0;
    totalSeconds.current = 0;
    hasShownReminder.current = false;
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      secondsSinceLastResponse.current += 1;
      totalSeconds.current += 1;

      // Check for max conversation time
      if (totalSeconds.current >= SOS_CONFIG.MAX_CONVERSATION_SECONDS) {
        onMaxTime();
        return;
      }

      // Check for first reminder
      if (
        !hasShownReminder.current &&
        secondsSinceLastResponse.current >= SOS_CONFIG.FIRST_REMINDER_SECONDS
      ) {
        hasShownReminder.current = true;
        onFirstReminder();
      }

      // Check for auto-send
      if (secondsSinceLastResponse.current >= SOS_CONFIG.AUTO_SEND_SECONDS) {
        onAutoSend();
      }
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, onFirstReminder, onAutoSend, onMaxTime]);

  return {
    resetResponseTimer,
    resetAll,
    getSecondsSinceLastResponse: () => secondsSinceLastResponse.current,
    getTotalSeconds: () => totalSeconds.current,
  };
}
