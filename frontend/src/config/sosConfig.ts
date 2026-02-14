/**
 * SOS Configuration Constants
 * Configurable timing values for the AI SOS Assistant
 */

export const SOS_CONFIG = {
  // ─── Initial Countdown ───────────────────────────────
  CANCEL_COUNTDOWN_SECONDS: 5, // Time user can cancel before AI starts

  // ─── AI Conversation Timeouts ────────────────────────
  FIRST_REMINDER_SECONDS: 15, // Time before showing "Are you there?"
  AUTO_SEND_SECONDS: 30, // Time before auto-sending (unresponsive)
  PARTIAL_RESPONSE_TIMEOUT: 20, // Time after last response before sending partial

  // ─── App Background/Lock ─────────────────────────────
  BACKGROUND_AUTO_SEND_SECONDS: 45, // Time before auto-send when app backgrounded

  // ─── Low Battery Mode ────────────────────────────────
  LOW_BATTERY_THRESHOLD: 0.15, // Battery level (15%) to trigger expedited mode
  LOW_BATTERY_MAX_QUESTIONS: 2, // Max questions to ask in low battery mode

  // ─── Conversation Limits ─────────────────────────────
  MAX_CONVERSATION_SECONDS: 120, // Hard limit - auto-send after 2 minutes
  MAX_QUESTIONS: 8, // Maximum questions before auto-send

  // ─── Duplicate SOS Detection ─────────────────────────
  DUPLICATE_SOS_WINDOW_MINUTES: 5, // Time window to detect duplicate SOS
} as const;

export type SOSConfigKey = keyof typeof SOS_CONFIG;
