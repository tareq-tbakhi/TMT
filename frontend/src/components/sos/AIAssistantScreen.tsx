/**
 * AI Assistant Screen - Main container for the AI SOS triage conversation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Camera, Mic, PhoneCall, Square } from "lucide-react";
import { useAIAssistantStore } from "../../store/aiAssistantStore";
import { useAuthStore } from "../../store/authStore";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { useConversationTimer } from "../../hooks/useConversationTimer";
import { AI_CONVERSATION_FLOW, URGENCY_KEYWORDS } from "../../config/conversationFlow";
import { SOS_CONFIG } from "../../config/sosConfig";
import { getPatientSOS } from "../../services/api";
import type { ConversationMessage, TriageData, QuickOption } from "../../types/sosTypes";
import { Button } from "../ui";

import { ConversationArea } from "./ConversationArea";
import { QuickResponses } from "./QuickResponses";
import { TextInput } from "./TextInput";
import { UrgentCallButton } from "./UrgentCallButton";
import { TimeoutOverlay } from "./TimeoutOverlay";
import { CameraCapture } from "./CameraCapture";

// Statuses for which the triage conversation may still attach to an SOS
const OPEN_SOS_STATUSES = ["pending", "acknowledged", "dispatched"];
const MAX_SOS_AGE_MS = 30 * 60 * 1000; // never bind the chat to a stale SOS

/**
 * Resolve the active SOS id for the current patient when it wasn't passed
 * as a prop (the SOS is created on button press, before this screen opens).
 * Returns null when offline or nothing recent is found — the conversation
 * then simply runs in the local scripted mode.
 */
async function resolveActiveSosId(): Promise<string | null> {
  try {
    const patientId = useAuthStore.getState().user?.patientId;
    if (!patientId) return null;
    const history = await getPatientSOS(patientId); // ordered newest-first
    const recent = history.find((s) => OPEN_SOS_STATUSES.includes(s.status));
    if (!recent) return null;
    const ageMs = Date.now() - new Date(recent.created_at).getTime();
    if (!Number.isFinite(ageMs) || ageMs > MAX_SOS_AGE_MS) return null;
    return recent.id;
  } catch {
    return null;
  }
}

interface AIAssistantScreenProps {
  onSendSOS: (triageData: TriageData) => void;
  onUrgentCall: () => void;
  onCancel: () => void;
  latitude: number | null;
  longitude: number | null;
  /** Active SOS id — enables the server-driven (LLM) conversation mode. */
  sosId?: string | null;
}

export function AIAssistantScreen({
  onSendSOS,
  onUrgentCall,
  onCancel,
  latitude,
  longitude,
  sosId = null,
}: AIAssistantScreenProps) {
  const store = useAIAssistantStore();
  const { t } = useTranslation();

  // Local state
  const [showCamera, setShowCamera] = useState(false);
  const [showTimeoutOverlay, setShowTimeoutOverlay] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(SOS_CONFIG.AUTO_SEND_SECONDS - SOS_CONFIG.FIRST_REMINDER_SECONDS);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track if we've started the conversation
  const hasStartedRef = useRef(false);

  // Set the instant an urgent send/auto-send fires — a late LLM reply must
  // never resume the conversation after that point.
  const sendFiredRef = useRef(false);

  // Guards async continuations after unmount (e.g. user cancelled)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Get current question
  const currentQuestion = AI_CONVERSATION_FLOW[store.currentQuestionIndex];
  const maxQuestions = AI_CONVERSATION_FLOW.length;

  // Check if user has started chatting (sent at least one message)
  const hasUserStartedChatting = store.messages.some((msg) => msg.role === "user");

  // Quick replies: server-suggested in LLM mode, scripted options offline
  const activeQuickOptions: QuickOption[] =
    store.mode === "llm" ? store.serverQuickReplies : currentQuestion?.options ?? [];

  // Voice input hook
  const { voiceState, isSupported, startListening, stopListening, resetTranscript } = useVoiceInput({
    onResult: (transcript, isFinal) => {
      // Any voice activity means user is present — reset inactivity timer
      resetResponseTimerRef.current();
      if (showTimeoutOverlay) setShowTimeoutOverlay(false);
      if (isFinal && transcript.trim()) {
        handleUserResponse(transcript);
      }
    },
  });

  // Ref to break circular dependency (voice callback needs resetResponseTimer before it's defined)
  const resetResponseTimerRef = useRef<() => void>(() => {});

  // Conversation timer
  const { resetResponseTimer } = useConversationTimer({
    isActive: !showTimeoutOverlay && store.state !== "sending" && store.state !== "done",
    onFirstReminder: () => {
      setShowTimeoutOverlay(true);
      setTimeoutSeconds(SOS_CONFIG.AUTO_SEND_SECONDS - SOS_CONFIG.FIRST_REMINDER_SECONDS);
    },
    onAutoSend: handleAutoSend,
    onMaxTime: handleAutoSend,
  });

  // Keep ref in sync so voice callback can access resetResponseTimer
  resetResponseTimerRef.current = resetResponseTimer;

  // Timeout countdown
  useEffect(() => {
    if (!showTimeoutOverlay) return;

    const interval = setInterval(() => {
      setTimeoutSeconds((s) => {
        if (s <= 1) {
          handleAutoSend();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showTimeoutOverlay]);

  // Generate unique message ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add AI message
  const addAIMessage = useCallback((content: string, questionId?: string, options?: QuickOption[]) => {
    const message: ConversationMessage = {
      id: generateId(),
      role: "ai",
      content,
      timestamp: new Date(),
      questionId,
      options,
    };
    store.addMessage(message);
  }, [store]);

  // Add user message
  const addUserMessage = useCallback((content: string, questionId?: string, selectedOption?: string, imageUrl?: string) => {
    const message: ConversationMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
      questionId,
      selectedOption,
      imageUrl,
    };
    store.addMessage(message);
  }, [store]);

  // Start conversation on mount
  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    // Show first question immediately (no greeting). The scripted opener is
    // always instant — if the backend LLM is available it takes over from
    // the next turn, so a slow network can never delay the conversation.
    if (currentQuestion) {
      addAIMessage(currentQuestion.question, currentQuestion.id, currentQuestion.options);
    }

    // Handshake with the backend conversation (fire-and-forget). On any
    // failure the store stays in "scripted" mode and the local flow runs.
    void (async () => {
      const activeSosId = sosId ?? (await resolveActiveSosId());
      if (activeSosId && mountedRef.current && !sendFiredRef.current) {
        void useAIAssistantStore.getState().startConversation(activeSosId);
      }
    })();
  }, []);

  // Check for urgency keywords
  const containsUrgencyKeyword = (text: string): boolean => {
    const lower = text.toLowerCase();
    return URGENCY_KEYWORDS.some((keyword) => lower.includes(keyword));
  };

  // Handle user response
  const handleUserResponse = useCallback((text: string, selectedOption?: string, imageUrl?: string) => {
    resetResponseTimer();
    resetTranscript();
    setShowTimeoutOverlay(false);

    // Add user message
    addUserMessage(text, currentQuestion?.id, selectedOption, imageUrl);

    // Check for urgency keywords — this always short-circuits locally,
    // no LLM round-trip can ever delay an urgent send.
    if (containsUrgencyKeyword(text)) {
      setIsProcessing(true);
      setTimeout(() => {
        addAIMessage(t("sos.ai.sendingNow"));
        setTimeout(() => {
          handleSendSOS();
        }, 500);
      }, 300);
      return;
    }

    // LLM mode: the backend generates the next question, quick replies and
    // structured triage extraction. Falls back to the scripted flow inside
    // handleLLMTurn if the server is unreachable or degraded.
    if (useAIAssistantStore.getState().mode === "llm") {
      setIsProcessing(true);
      void handleLLMTurn(text);
      return;
    }

    // Scripted (offline) mode — the original hardcoded flow
    if (currentQuestion) {
      updateTriageData(currentQuestion.id, selectedOption || text);
    }
    advanceScriptedFlow();
  }, [currentQuestion, resetResponseTimer, resetTranscript, addUserMessage, addAIMessage, t]);

  // Advance the hardcoded question flow (offline path — always available)
  function advanceScriptedFlow() {
    setIsProcessing(true);
    setTimeout(() => {
      // Acknowledgment
      addAIMessage(t("sos.ai.understood"));

      setTimeout(() => {
        if (sendFiredRef.current || !mountedRef.current) return;
        const nextIndex = useAIAssistantStore.getState().currentQuestionIndex + 1;

        // Check if we should end (max questions reached or all questions answered)
        if (nextIndex >= maxQuestions || nextIndex >= AI_CONVERSATION_FLOW.length) {
          addAIMessage(t("sos.ai.sendingNow"));
          setTimeout(() => {
            handleSendSOS();
          }, 500);
        } else {
          // Ask next question
          store.nextQuestion();
          const nextQuestion = AI_CONVERSATION_FLOW[nextIndex];
          if (nextQuestion) {
            addAIMessage(nextQuestion.question, nextQuestion.id, nextQuestion.options);
          }
        }
        setIsProcessing(false);
      }, 800);
    }, 300);
  }

  // One server-driven conversation turn. The unresponsive/auto-send timers
  // keep running while we await the LLM; the pending call is abandoned the
  // moment an urgent send fires.
  async function handleLLMTurn(text: string) {
    const turn = await useAIAssistantStore.getState().sendMessageToAI(text);

    // Urgent auto-send fired (or screen unmounted) while awaiting the LLM —
    // never resume the conversation past that point.
    if (sendFiredRef.current || !mountedRef.current) return;

    if (!turn) {
      // If the store still reports "llm", this call was merely superseded by
      // a newer message (e.g. rapid voice input) — the newer turn drives.
      if (useAIAssistantStore.getState().mode === "llm") return;
      // Genuine failure (timeout/offline/degraded): continue seamlessly with
      // the offline scripted flow from the current position.
      advanceScriptedFlow();
      return;
    }

    // Hard cap: never let the conversation run past MAX_QUESTIONS answers
    const answeredCount = useAIAssistantStore
      .getState()
      .messages.filter((m) => m.role === "user").length;
    const forceComplete = answeredCount >= SOS_CONFIG.MAX_QUESTIONS;

    if (turn.urgencyDetected || turn.conversationComplete || forceComplete) {
      addAIMessage(turn.reply?.content || t("sos.ai.sendingNow"));
      setTimeout(() => {
        handleSendSOS();
      }, 600);
      return;
    }

    if (turn.reply) {
      addAIMessage(turn.reply.content, undefined, turn.reply.quickReplies);
      // Keep the scripted index roughly in step so a mid-conversation
      // fallback resumes from a sensible position, and low-battery/urgency
      // partial submissions behave the same in both modes.
      store.nextQuestion();
    }
    setIsProcessing(false);
  }

  // Update triage data
  const updateTriageData = (questionId: string, value: string) => {
    const lower = value.toLowerCase();

    switch (questionId) {
      case "emergency_type":
        if (lower.includes("medical")) store.setTriageData({ emergencyType: "medical" });
        else if (lower.includes("danger")) store.setTriageData({ emergencyType: "danger" });
        else if (lower.includes("trapped")) store.setTriageData({ emergencyType: "trapped" });
        else if (lower.includes("evacuate")) store.setTriageData({ emergencyType: "evacuate" });
        break;
      case "injured":
        if (lower.includes("serious")) store.setTriageData({ injuryStatus: "serious" });
        else if (lower.includes("minor")) store.setTriageData({ injuryStatus: "minor" });
        else if (lower.includes("no")) store.setTriageData({ injuryStatus: "none" });
        break;
      case "people_count":
        if (lower.includes("just me") || lower === "1") store.setTriageData({ peopleCount: "just_me" });
        else if (lower.includes("2") || lower.includes("3") || lower.includes("few")) store.setTriageData({ peopleCount: "2_3_people" });
        else if (lower.includes("more") || lower.includes("many")) store.setTriageData({ peopleCount: "more_than_3" });
        break;
      case "can_move":
        if (lower.includes("yes") || lower.includes("can")) store.setTriageData({ canMove: "can_move" });
        else if (lower.includes("trapped")) store.setTriageData({ canMove: "trapped" });
        else if (lower.includes("injured") || lower.includes("no")) store.setTriageData({ canMove: "injured" });
        break;
      case "details":
        store.setTriageData({ additionalDetails: value });
        break;
    }
  };

  // Handle quick option select
  const handleQuickSelect = (option: QuickOption) => {
    handleUserResponse(option.label, option.id);
  };

  // Handle text send
  const handleTextSend = (text: string) => {
    handleUserResponse(text);
  };

  // Handle typing activity — resets inactivity timer so auto-call doesn't interrupt
  const handleTypingActivity = () => {
    resetResponseTimer();
    // Dismiss timeout overlay if user is actively typing
    if (showTimeoutOverlay) {
      setShowTimeoutOverlay(false);
    }
  };

  // Handle camera capture
  const handleCameraCapture = (imageUrl: string) => {
    const existingImages = store.triageData.attachedImages || [];
    store.setTriageData({ attachedImages: [...existingImages, imageUrl] });
    addUserMessage("Photo attached", currentQuestion?.id, undefined, imageUrl);
    resetResponseTimer();
  };

  // Handle auto-send (timeout) - User unresponsive = URGENT, auto-call operator
  function handleAutoSend() {
    sendFiredRef.current = true;
    // Abandon any in-flight LLM call — it must never delay the urgent path
    useAIAssistantStore.getState().abandonPendingLLM();
    setShowTimeoutOverlay(false);
    stopListening();
    // User didn't respond - this is urgent! Auto-trigger the call
    onUrgentCall();
  }

  // Handle send SOS
  const handleSendSOS = () => {
    sendFiredRef.current = true;
    useAIAssistantStore.getState().abandonPendingLLM();
    store.setState("sending");
    stopListening();
    // Read the freshest triage data (LLM extraction may have just landed)
    onSendSOS(useAIAssistantStore.getState().triageData);
  };

  // Handle timeout tap (user is still there)
  const handleTimeoutTap = () => {
    setShowTimeoutOverlay(false);
    resetResponseTimer();
  };


  return (
    <div className="flex min-h-full flex-col">
      {/* Header */}
      <header className="border-b border-edge bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent shadow-1"
            >
              <Bot className="h-6 w-6" />
            </span>
            <h2 className="truncate text-lg font-bold text-ink">AI Assistant</h2>
          </div>

          {/* Urgent Call Icon Button - only shows after user starts chatting */}
          {hasUserStartedChatting && (
            <button
              type="button"
              onClick={onUrgentCall}
              aria-label="Urgent call to operator - 101"
              className="flex min-h-12 shrink-0 items-center gap-2 rounded-lg bg-sos px-3 py-2 text-on-sos shadow-2 transition-all hover:bg-sos-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 active:scale-95"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-md bg-on-sos/20"
              >
                <PhoneCall className="h-5 w-5" />
              </span>
              <span className="pe-1 text-lg font-bold">101</span>
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        {/* Conversation Area */}
        <ConversationArea messages={store.messages} isTyping={isProcessing} />

        {/* Quick Responses */}
        {activeQuickOptions.length > 0 && !isProcessing && (
          <QuickResponses
            options={activeQuickOptions}
            onSelect={handleQuickSelect}
            disabled={isProcessing}
          />
        )}

        {/* Text Input — always visible so user can free-write at any time */}
        <TextInput onSend={handleTextSend} onTyping={handleTypingActivity} disabled={isProcessing} placeholder="Describe what's happening..." />

        {/* Voice & Camera Toggle Bar */}
        <div className="flex items-center justify-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              if (voiceState.isListening) {
                stopListening();
              } else {
                startListening();
                handleTypingActivity(); // reset timer when starting voice
              }
            }}
            aria-label={voiceState.isListening ? "Stop recording" : "Start voice input"}
            aria-pressed={voiceState.isListening}
            className={`flex min-h-12 items-center gap-2 rounded-lg border-2 px-4 py-2.5 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              voiceState.isListening
                ? "animate-pulse border-danger bg-danger text-white"
                : "border-edge-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft"
            }`}
          >
            {voiceState.isListening ? (
              <Square aria-hidden="true" className="h-5 w-5 fill-current" />
            ) : (
              <Mic aria-hidden="true" className="h-5 w-5" />
            )}
            <span className="text-base font-semibold">{voiceState.isListening ? "Stop" : "Voice"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCamera(true)}
            aria-label="Attach photo"
            className="flex min-h-12 items-center gap-2 rounded-lg border-2 border-edge-strong bg-surface px-4 py-2.5 text-ink transition-colors hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
          >
            <Camera aria-hidden="true" className="h-5 w-5" />
            <span className="text-base font-semibold">Photo</span>
          </button>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col gap-3 border-t border-edge bg-surface px-4 py-4">
          {/* Urgent Call Button - shows at bottom before user starts chatting */}
          {!hasUserStartedChatting && (
            <UrgentCallButton onPress={onUrgentCall} />
          )}

          <Button variant="secondary" size="lg" fullWidth onClick={onCancel}>
            Cancel SOS
          </Button>
        </div>
      </div>

      {/* Timeout Overlay */}
      {showTimeoutOverlay && (
        <TimeoutOverlay
          secondsRemaining={timeoutSeconds}
          onTap={handleTimeoutTap}
          onCallNow={handleAutoSend}
        />
      )}

      {/* Camera Capture */}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
