/**
 * TypeScript types for the AI SOS Assistant
 */

// ─── Emergency Types ───────────────────────────────────
export type EmergencyType = "medical" | "danger" | "trapped" | "evacuate";
export type InjuryStatus = "serious" | "minor" | "none";
export type PeopleCount = "just_me" | "2_3_people" | "more_than_3";
export type MobilityStatus = "can_move" | "trapped" | "injured";
export type InputMode = "voice" | "text";

// ─── Message Types ─────────────────────────────────────
export interface AIMessage {
  id: string;
  role: "ai";
  content: string;
  timestamp: Date;
  questionId?: string;
  options?: QuickOption[];
}

export interface UserMessage {
  id: string;
  role: "user";
  content: string;
  timestamp: Date;
  questionId?: string;
  selectedOption?: string;
  imageUrl?: string;
}

export type ConversationMessage = AIMessage | UserMessage;

// ─── Quick Response Options ────────────────────────────
export interface QuickOption {
  id: string;
  label: string;
}

// ─── Question Definition ───────────────────────────────
export interface ConversationQuestion {
  id: string;
  question: string;
  options: QuickOption[];
  required: boolean;
  allowText?: boolean;
  allowImage?: boolean;
}

// ─── Triage Data (Collected Info) ──────────────────────
export interface TriageData {
  emergencyType?: EmergencyType;
  injuryStatus?: InjuryStatus;
  peopleCount?: PeopleCount;
  canMove?: MobilityStatus;
  additionalDetails?: string;
  attachedImages?: string[];
}

// ─── AI Assistant State ────────────────────────────────
export type AIAssistantState =
  | "listening" // Voice input active, waiting for user
  | "processing" // Processing user input (typing indicator)
  | "asking" // Displaying AI question
  | "timeout_warning" // Showing "Are you there?" reminder
  | "auto_sending" // Auto-send countdown active
  | "sending" // Submitting SOS
  | "done"; // Conversation complete

// ─── Voice Input State ─────────────────────────────────
export interface VoiceState {
  isListening: boolean;
  transcript: string;
  confidence: number;
  error?: string;
}

// ─── SOS Screen State (extends existing) ───────────────
export type SOSScreenState =
  | "idle"
  | "countdown"
  | "ai_assistant"
  | "calling"
  | "sending"
  | "sent"
  | "sms_ready"
  | "error"
  | "cancelled";
