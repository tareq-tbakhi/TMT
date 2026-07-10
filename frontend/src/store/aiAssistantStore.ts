/**
 * Zustand store for AI SOS Assistant state management
 *
 * Drives the triage conversation in one of two modes:
 *  - "llm":      the backend (GLM-5 via /sos/{id}/conversation) generates
 *                replies, quick-reply suggestions and structured triage data.
 *  - "scripted": the local hardcoded flow (config/conversationFlow.ts) —
 *                the offline path. This is the default and the seamless
 *                fallback whenever the backend is unreachable, times out,
 *                or reports mode="scripted".
 *
 * Life-critical guarantees:
 *  - LLM calls are hard-capped with AbortController timeouts; they never
 *    pause the unresponsive/auto-send timers (owned by the screen).
 *  - `abandonPendingLLM()` cancels any in-flight call the moment an
 *    urgent auto-send fires.
 *  - Any LLM failure flips the session to "scripted" so the conversation
 *    continues locally without the user noticing.
 */

import { create } from "zustand";
import type {
  AIAssistantState,
  ConversationMessage,
  TriageData,
  VoiceState,
  InputMode,
  QuickOption,
  EmergencyType,
  InjuryStatus,
  PeopleCount,
  MobilityStatus,
} from "../types/sosTypes";

// ─── Conversation modes ────────────────────────────────────────────

export type ConversationMode = "scripted" | "llm";

export interface ServerReply {
  id: string;
  content: string;
  quickReplies: QuickOption[];
}

export interface ServerTurn {
  reply: ServerReply | null;
  triageData: Partial<TriageData>;
  conversationComplete: boolean;
  urgencyDetected: boolean;
}

// ─── Backend conversation API (self-contained fetch helpers) ───────
// Deliberately NOT in services/api.ts: this path must never redirect to
// /login on a 401 or throw UI-level errors — any failure here simply
// degrades to the offline scripted flow.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const CONV_START_TIMEOUT_MS = 6000; // handshake — fail fast, scripted Q1 is already on screen
const CONV_REPLY_TIMEOUT_MS = 12000; // per-turn cap — well under the 15s "are you there?" reminder

interface WireMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface ConversationRequestBody {
  content: string;
  start?: boolean;
  battery_low?: boolean;
  language?: string;
  local_context?: WireMessage[];
}

interface ConversationResponseBody {
  sos_id: string;
  mode: "llm" | "scripted";
  reply: {
    id: string;
    role: string;
    content: string;
    timestamp: string;
    quick_replies?: Array<{ id: string; label: string }>;
  } | null;
  triage_data?: Record<string, unknown> | null;
  conversation_complete?: boolean;
  urgency_detected?: boolean;
}

function toWireMessage(m: ConversationMessage): WireMessage {
  return {
    role: m.role,
    content: m.content,
    timestamp:
      m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
  };
}

function currentLanguage(): string {
  try {
    return localStorage.getItem("tmt-language") || "en";
  } catch {
    return "en";
  }
}

/** Map + validate the server's snake_case triage extraction to TriageData. */
export function mapServerTriageData(
  raw: Record<string, unknown> | null | undefined
): Partial<TriageData> {
  const out: Partial<TriageData> = {};
  if (!raw || typeof raw !== "object") return out;

  const pick = <T extends string>(value: unknown, valid: readonly T[]): T | undefined =>
    typeof value === "string" && (valid as readonly string[]).includes(value)
      ? (value as T)
      : undefined;

  const emergencyType = pick<EmergencyType>(raw.emergency_type, [
    "medical",
    "danger",
    "trapped",
    "evacuate",
  ]);
  if (emergencyType) out.emergencyType = emergencyType;

  const injuryStatus = pick<InjuryStatus>(raw.injury_status, ["serious", "minor", "none"]);
  if (injuryStatus) out.injuryStatus = injuryStatus;

  const peopleCount = pick<PeopleCount>(raw.people_count, [
    "just_me",
    "2_3_people",
    "more_than_3",
  ]);
  if (peopleCount) out.peopleCount = peopleCount;

  const canMove = pick<MobilityStatus>(raw.can_move, ["can_move", "trapped", "injured"]);
  if (canMove) out.canMove = canMove;

  if (typeof raw.additional_details === "string" && raw.additional_details.trim()) {
    out.additionalDetails = raw.additional_details.trim();
  }

  return out;
}

// In-flight request management (module-level: non-serializable state)
let activeController: AbortController | null = null;
let sessionSeq = 0; // bumped on reset() — stale async continuations bail out
let callSeq = 0; // bumped per send — a superseded call must not flip the mode

async function postConversationMessage(
  sosId: string,
  body: ConversationRequestBody,
  timeoutMs: number
): Promise<ConversationResponseBody> {
  // Abort any previous in-flight call — latest user input wins.
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const token = localStorage.getItem("tmt-token");
    const response = await fetch(
      `${API_BASE}/api/v1/sos/${sosId}/conversation/message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new Error(`Conversation request failed with status ${response.status}`);
    }
    return (await response.json()) as ConversationResponseBody;
  } finally {
    clearTimeout(timer);
    if (activeController === controller) activeController = null;
  }
}

// ─── Store ─────────────────────────────────────────────────────────

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

  // LLM conversation session
  sosId: string | null;
  mode: ConversationMode;
  llmPending: boolean;
  serverQuickReplies: QuickOption[];
  conversationComplete: boolean;
  /** How many leading `messages` entries the server transcript already has. */
  serverSyncedCount: number;

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

  // LLM conversation actions
  /**
   * Handshake with the backend for an active SOS. Fire-and-forget from the
   * screen: on success with mode="llm" the server drives subsequent turns;
   * on any failure the session simply stays "scripted" (local flow).
   */
  startConversation: (sosId: string) => Promise<void>;
  /**
   * Send the user's latest message to the backend and get the next AI turn.
   * CONTRACT: call this right after `addMessage`-ing the user message (it
   * must be the last entry in `messages`). Returns `null` when the caller
   * should continue with the local scripted flow instead (mode flipped).
   */
  sendMessageToAI: (content: string) => Promise<ServerTurn | null>;
  /** Cancel any in-flight LLM call (e.g. the moment auto-send fires). */
  abandonPendingLLM: () => void;
}

const initialVoiceState: VoiceState = {
  isListening: false,
  transcript: "",
  confidence: 0,
};

export const useAIAssistantStore = create<AIAssistantStore>((set, get) => ({
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

  sosId: null,
  mode: "scripted",
  llmPending: false,
  serverQuickReplies: [],
  conversationComplete: false,
  serverSyncedCount: 0,

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

  reset: () => {
    sessionSeq += 1;
    activeController?.abort();
    activeController = null;
    set({
      state: "listening",
      messages: [],
      currentQuestionIndex: 0,
      triageData: {},
      inputMode: "voice",
      voiceState: initialVoiceState,
      secondsSinceLastResponse: 0,
      totalConversationSeconds: 0,
      sosId: null,
      mode: "scripted",
      llmPending: false,
      serverQuickReplies: [],
      conversationComplete: false,
      serverSyncedCount: 0,
    });
  },

  incrementTimer: () =>
    set((s) => ({
      secondsSinceLastResponse: s.secondsSinceLastResponse + 1,
      totalConversationSeconds: s.totalConversationSeconds + 1,
    })),

  resetResponseTimer: () => set({ secondsSinceLastResponse: 0 }),

  setLowBattery: (isLow) => set({ isLowBattery: isLow }),

  // ─── LLM conversation actions ────────────────────────

  startConversation: async (sosId) => {
    const mySession = sessionSeq;
    set({ sosId });

    try {
      const syncedAtCall = get().messages.length;
      const data = await postConversationMessage(
        sosId,
        {
          content: "",
          start: true,
          battery_low: get().isLowBattery,
          language: currentLanguage(),
          // Seed the server transcript with anything already rendered
          // locally (e.g. the scripted opening question).
          local_context: get().messages.map(toWireMessage),
        },
        CONV_START_TIMEOUT_MS
      );

      if (sessionSeq !== mySession) return; // reset happened mid-flight

      if (data.mode === "llm") {
        set({ mode: "llm", serverSyncedCount: syncedAtCall });
      }
      // mode === "scripted" → nothing to do: local flow is already running.
    } catch {
      // Offline / timeout / server error — stay on the scripted flow.
    }
  },

  sendMessageToAI: async (content) => {
    const s = get();
    if (s.mode !== "llm" || !s.sosId) return null;

    const mySession = sessionSeq;
    const myCall = ++callSeq;
    const countAtSend = s.messages.length;
    // Everything after serverSyncedCount except the final entry (the user
    // message being sent as `content`) is unsynced local context.
    const unsynced = s.messages.slice(
      s.serverSyncedCount,
      Math.max(s.serverSyncedCount, countAtSend - 1)
    );

    set({ llmPending: true });

    try {
      const data = await postConversationMessage(
        s.sosId,
        {
          content,
          battery_low: get().isLowBattery,
          language: currentLanguage(),
          local_context: unsynced.map(toWireMessage),
        },
        CONV_REPLY_TIMEOUT_MS
      );

      if (sessionSeq !== mySession || callSeq !== myCall) return null; // superseded/reset

      if (data.mode !== "llm") {
        // Server degraded (key removed / LLM down) — continue locally.
        set({ mode: "scripted", llmPending: false, serverQuickReplies: [] });
        return null;
      }

      const triageData = mapServerTriageData(data.triage_data);
      if (Object.keys(triageData).length > 0) {
        get().setTriageData(triageData);
      }

      const reply: ServerReply | null = data.reply
        ? {
            id: data.reply.id,
            content: data.reply.content,
            quickReplies: (data.reply.quick_replies ?? []).map((qr) => ({
              id: qr.id,
              label: qr.label,
            })),
          }
        : null;

      set({
        llmPending: false,
        // Server has stored: prior unsynced + this user message + its reply.
        // The screen appends the reply message right after this resolves.
        serverSyncedCount: countAtSend + (reply ? 1 : 0),
        serverQuickReplies: reply?.quickReplies ?? [],
        conversationComplete: Boolean(data.conversation_complete),
      });

      return {
        reply,
        triageData,
        conversationComplete: Boolean(data.conversation_complete),
        urgencyDetected: Boolean(data.urgency_detected),
      };
    } catch {
      // Only the latest call may flip the mode — a call aborted because a
      // newer user message superseded it must not disturb the session.
      if (sessionSeq === mySession && callSeq === myCall) {
        // Timeout / offline / server error — fall back to the local scripted flow.
        set({ mode: "scripted", llmPending: false, serverQuickReplies: [] });
      }
      return null;
    }
  },

  abandonPendingLLM: () => {
    activeController?.abort();
    activeController = null;
    set({ llmPending: false });
  },
}));
