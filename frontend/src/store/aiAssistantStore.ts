/**
 * Zustand store for AI SOS Assistant state management
 */

import { create } from "zustand";
import type {
  AIAssistantState,
  ConversationMessage,
  TriageData,
  VoiceState,
  InputMode,
} from "../types/sosTypes";
import {
  sosAssistant,
  type AssistantMessage,
  type AssistantReply,
  type AssistantTriage,
} from "../services/api";
import { AI_CONVERSATION_FLOW, AI_RESPONSES } from "../config/conversationFlow";

/**
 * Result of asking the assistant for its next turn. `source` reflects whether
 * the answer came from the GLM-backed backend, or from the local scripted
 * fallback (used when offline or on any backend/AI error).
 */
export interface AssistantTurn {
  message: string;
  done: boolean;
  source: "glm" | "fallback";
}

/**
 * Deterministic local fallback that walks the existing scripted conversation
 * flow (`conversationFlow.ts`). Used when offline or when the backend errors,
 * so the citizen always gets a coherent next question. This is the SAME flow
 * the UI already drives, kept here as the resilient fallback path.
 */
/** Map the backend's structured triage onto the local TriageData shape. */
export function mapTriage(t: AssistantTriage): Partial<TriageData> {
  const patch: Partial<TriageData> = {};
  if (
    t.emergency_type === "medical" ||
    t.emergency_type === "danger" ||
    t.emergency_type === "trapped" ||
    t.emergency_type === "evacuate"
  ) {
    patch.emergencyType = t.emergency_type;
  }
  if (t.anyone_injured === true) {
    // Map severity (if any) to a serious/minor distinction.
    patch.injuryStatus = (t.severity ?? 0) >= 5 ? "serious" : "minor";
  } else if (t.anyone_injured === false) {
    patch.injuryStatus = "none";
  }
  if (typeof t.num_people === "number") {
    if (t.num_people <= 1) patch.peopleCount = "just_me";
    else if (t.num_people <= 3) patch.peopleCount = "2_3_people";
    else patch.peopleCount = "more_than_3";
  }
  if (Array.isArray(t.needs) && t.needs.length > 0) {
    patch.additionalDetails = t.needs.join(", ");
  }
  return patch;
}

export function scriptedNextTurn(messages: AssistantMessage[]): AssistantTurn {
  const userTurns = messages.filter((m) => m.role === "user").length;
  if (userTurns >= AI_CONVERSATION_FLOW.length) {
    return { message: AI_RESPONSES.sendingNow, done: true, source: "fallback" };
  }
  const q = AI_CONVERSATION_FLOW[userTurns];
  return { message: q.question, done: false, source: "fallback" };
}

interface AIAssistantStore {
  // ─── State ───────────────────────────────────────────
  state: AIAssistantState;
  messages: ConversationMessage[];
  currentQuestionIndex: number;
  triageData: TriageData;
  inputMode: InputMode;
  voiceState: VoiceState;

  // Timers
  secondsSinceLastResponse: number;
  totalConversationSeconds: number;
  isLowBattery: boolean;

  // ─── Actions ─────────────────────────────────────────
  setState: (state: AIAssistantState) => void;
  addMessage: (message: ConversationMessage) => void;
  setTriageData: (data: Partial<TriageData>) => void;
  setInputMode: (mode: InputMode) => void;
  setVoiceState: (state: Partial<VoiceState>) => void;
  nextQuestion: () => void;
  reset: () => void;

  /**
   * Ask the GLM-backed backend for the assistant's next turn. Merges any
   * returned triage into local triageData. On error/offline, transparently
   * falls back to the local scripted flow. NEVER throws.
   */
  requestAssistantReply: (
    messages: AssistantMessage[],
    language: string
  ) => Promise<AssistantTurn>;

  // Timer actions
  incrementTimer: () => void;
  resetResponseTimer: () => void;
  setLowBattery: (isLow: boolean) => void;
}

const initialVoiceState: VoiceState = {
  isListening: false,
  transcript: "",
  confidence: 0,
};

export const useAIAssistantStore = create<AIAssistantStore>((set) => ({
  // Initial state
  state: "listening",
  messages: [],
  currentQuestionIndex: 0,
  triageData: {},
  inputMode: "voice",
  voiceState: initialVoiceState,
  secondsSinceLastResponse: 0,
  totalConversationSeconds: 0,
  isLowBattery: false,

  // Actions
  setState: (state) => set({ state }),

  addMessage: (message) =>
    set((s) => ({ messages: [...s.messages, message] })),

  setTriageData: (data) =>
    set((s) => ({ triageData: { ...s.triageData, ...data } })),

  setInputMode: (mode) => set({ inputMode: mode }),

  setVoiceState: (voiceState) =>
    set((s) => ({ voiceState: { ...s.voiceState, ...voiceState } })),

  nextQuestion: () =>
    set((s) => ({ currentQuestionIndex: s.currentQuestionIndex + 1 })),

  requestAssistantReply: async (messages, language) => {
    // Offline → don't even attempt the network; use the scripted flow.
    const online =
      typeof navigator === "undefined" ? true : navigator.onLine;

    if (online) {
      try {
        const reply: AssistantReply = await sosAssistant({
          messages,
          language,
        });
        // Merge any structured triage the backend returned.
        const patch = mapTriage(reply.triage);
        if (Object.keys(patch).length > 0) {
          set((s) => ({ triageData: { ...s.triageData, ...patch } }));
        }
        return {
          message: reply.message,
          done: reply.done,
          source: reply.source,
        };
      } catch {
        // Fall through to scripted fallback on ANY backend/AI error.
      }
    }
    return scriptedNextTurn(messages);
  },

  reset: () =>
    set({
      state: "listening",
      messages: [],
      currentQuestionIndex: 0,
      triageData: {},
      inputMode: "voice",
      voiceState: initialVoiceState,
      secondsSinceLastResponse: 0,
      totalConversationSeconds: 0,
    }),

  incrementTimer: () =>
    set((s) => ({
      secondsSinceLastResponse: s.secondsSinceLastResponse + 1,
      totalConversationSeconds: s.totalConversationSeconds + 1,
    })),

  resetResponseTimer: () => set({ secondsSinceLastResponse: 0 }),

  setLowBattery: (isLow) => set({ isLowBattery: isLow }),
}));
