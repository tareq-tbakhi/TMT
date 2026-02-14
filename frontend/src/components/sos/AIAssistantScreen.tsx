/**
 * AI Assistant Screen - Main container for the AI SOS triage conversation
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAIAssistantStore } from "../../store/aiAssistantStore";
import { useVoiceInput } from "../../hooks/useVoiceInput";
import { useConversationTimer } from "../../hooks/useConversationTimer";
import { AI_CONVERSATION_FLOW, URGENCY_KEYWORDS, AI_RESPONSES } from "../../config/conversationFlow";
import { SOS_CONFIG } from "../../config/sosConfig";
import type { ConversationMessage, TriageData, QuickOption, InputMode } from "../../types/sosTypes";

import { ConversationArea } from "./ConversationArea";
import { QuickResponses } from "./QuickResponses";
import { VoiceInput } from "./VoiceInput";
import { TextInput } from "./TextInput";
import { UrgentCallButton } from "./UrgentCallButton";
import { TimeoutOverlay } from "./TimeoutOverlay";
import { CameraCapture } from "./CameraCapture";

interface AIAssistantScreenProps {
  onSendSOS: (triageData: TriageData) => void;
  onUrgentCall: () => void;
  onCancel: () => void;
  latitude: number | null;
  longitude: number | null;
}

export function AIAssistantScreen({
  onSendSOS,
  onUrgentCall,
  onCancel,
  latitude,
  longitude,
}: AIAssistantScreenProps) {
  const store = useAIAssistantStore();

  // Local state
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [showTextInput, setShowTextInput] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showTimeoutOverlay, setShowTimeoutOverlay] = useState(false);
  const [timeoutSeconds, setTimeoutSeconds] = useState(SOS_CONFIG.AUTO_SEND_SECONDS - SOS_CONFIG.FIRST_REMINDER_SECONDS);
  const [isProcessing, setIsProcessing] = useState(false);

  // Track if we've started the conversation
  const hasStartedRef = useRef(false);

  // Get current question
  const currentQuestion = AI_CONVERSATION_FLOW[store.currentQuestionIndex];
  const maxQuestions = AI_CONVERSATION_FLOW.length;

  // Check if user has started chatting (sent at least one message)
  const hasUserStartedChatting = store.messages.some((msg) => msg.role === "user");

  // Voice input hook
  const { voiceState, isSupported, startListening, stopListening, resetTranscript } = useVoiceInput({
    onResult: (transcript, isFinal) => {
      if (isFinal && transcript.trim()) {
        handleUserResponse(transcript);
      }
    },
  });

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

    // Show first question immediately (no greeting)
    if (currentQuestion) {
      addAIMessage(currentQuestion.question, currentQuestion.id, currentQuestion.options);
    }
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

    // Check for urgency keywords
    if (containsUrgencyKeyword(text)) {
      setIsProcessing(true);
      setTimeout(() => {
        addAIMessage(AI_RESPONSES.sendingNow);
        setTimeout(() => {
          handleSendSOS();
        }, 500);
      }, 300);
      return;
    }

    // Update triage data based on current question
    if (currentQuestion) {
      updateTriageData(currentQuestion.id, selectedOption || text);
    }

    // Move to next question
    setIsProcessing(true);
    setTimeout(() => {
      // Acknowledgment
      addAIMessage(AI_RESPONSES.understood);

      setTimeout(() => {
        const nextIndex = store.currentQuestionIndex + 1;

        // Check if we should end (max questions reached or all questions answered)
        if (nextIndex >= maxQuestions || nextIndex >= AI_CONVERSATION_FLOW.length) {
          addAIMessage(AI_RESPONSES.sendingNow);
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
  }, [currentQuestion, store.currentQuestionIndex, maxQuestions, resetResponseTimer, resetTranscript, addUserMessage, addAIMessage]);

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

  // Handle camera capture
  const handleCameraCapture = (imageUrl: string) => {
    const existingImages = store.triageData.attachedImages || [];
    store.setTriageData({ attachedImages: [...existingImages, imageUrl] });
    addUserMessage("Photo attached", currentQuestion?.id, undefined, imageUrl);
    resetResponseTimer();
  };

  // Handle auto-send (timeout) - User unresponsive = URGENT, auto-call operator
  function handleAutoSend() {
    setShowTimeoutOverlay(false);
    stopListening();
    // User didn't respond - this is urgent! Auto-trigger the call
    onUrgentCall();
  }

  // Handle send SOS
  const handleSendSOS = () => {
    store.setState("sending");
    stopListening();
    onSendSOS(store.triageData);
  };

  // Handle timeout tap (user is still there)
  const handleTimeoutTap = () => {
    setShowTimeoutOverlay(false);
    resetResponseTimer();
  };

  // Toggle input mode
  const toggleInputMode = () => {
    if (inputMode === "voice") {
      stopListening();
      setInputMode("text");
      setShowTextInput(true);
    } else {
      setShowTextInput(false);
      setInputMode("voice");
      startListening();
    }
  };

  // Toggle voice
  const toggleVoice = () => {
    if (voiceState.isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="min-h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 12H7v-2h10v2zm0-3H7V9h10v2zm0-3H7V6h10v2z"/>
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg">AI Assistant</h1>
            </div>
          </div>

          {/* Urgent Call Icon Button - only shows after user starts chatting */}
          {hasUserStartedChatting && (
            <button
              onClick={onUrgentCall}
              className="flex items-center gap-2 bg-gradient-to-br from-red-500 to-red-600 rounded-xl px-3 py-2 shadow-lg shadow-red-200 hover:from-red-600 hover:to-red-700 active:scale-95 transition-all"
              aria-label="Urgent call to operator - 101"
            >
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </div>
              <span className="text-white font-bold text-lg pr-1">101</span>
            </button>
          )}
        </div>
      </div>

      {/* Conversation Area */}
      <ConversationArea messages={store.messages} isTyping={isProcessing} />

      {/* Quick Responses */}
      {currentQuestion && currentQuestion.options.length > 0 && !isProcessing && (
        <QuickResponses
          options={currentQuestion.options}
          onSelect={handleQuickSelect}
          disabled={isProcessing}
        />
      )}

      {/* Voice Input */}
      {inputMode === "voice" && !showTextInput && (
        <VoiceInput
          voiceState={voiceState}
          isSupported={isSupported}
          onToggle={toggleVoice}
        />
      )}

      {/* Text Input */}
      {showTextInput && (
        <TextInput onSend={handleTextSend} disabled={isProcessing} />
      )}

      {/* Input Mode Toggle & Camera */}
      <div className="flex items-center justify-center gap-3 py-3 px-4 bg-gray-50">
        <button
          onClick={toggleInputMode}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all ${
            showTextInput
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600"
          }`}
          aria-label={inputMode === "voice" ? "Switch to text" : "Switch to voice"}
        >
          {inputMode === "voice" ? (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span className="text-sm font-medium">Type</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V22h-2v-6.07z" />
              </svg>
              <span className="text-sm font-medium">Voice</span>
            </>
          )}
        </button>

        <button
          onClick={() => setShowCamera(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border-2 border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-all"
          aria-label="Attach photo"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path fillRule="evenodd" d="M1.5 7.125c0-1.036.84-1.875 1.875-1.875h3.5l1.5-2h7.25l1.5 2h3.5c1.035 0 1.875.84 1.875 1.875v10.5c0 1.036-.84 1.875-1.875 1.875H3.375a1.875 1.875 0 01-1.875-1.875v-10.5zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">Photo</span>
        </button>
      </div>

      {/* Bottom Actions */}
      <div className="bg-white border-t border-gray-100 px-4 py-4 space-y-3">
        {/* Urgent Call Button - shows at bottom before user starts chatting */}
        {!hasUserStartedChatting && (
          <UrgentCallButton onPress={onUrgentCall} />
        )}

        <button
          onClick={onCancel}
          className="w-full py-3 bg-gray-100 text-gray-600 font-medium rounded-xl hover:bg-gray-200 hover:text-gray-700 transition-colors"
        >
          Cancel SOS
        </button>
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
