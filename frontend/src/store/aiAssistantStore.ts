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
