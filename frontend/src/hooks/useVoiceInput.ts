/**
 * Custom hook for voice input using Web Speech API
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { VoiceState } from "../types/sosTypes";

// Extend Window interface for webkit speech recognition
declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface UseVoiceInputOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const {
    language = "en-US",
    continuous = true,
    interimResults = true,
    onResult,
    onError,
  } = options;

  const [voiceState, setVoiceState] = useState<VoiceState>({
    isListening: false,
    transcript: "",
    confidence: 0,
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isSupported = typeof window !== "undefined" && "webkitSpeechRecognition" in window;

  const startListening = useCallback(() => {
    if (!isSupported) {
      const errorMsg = "Voice input not supported in this browser";
      setVoiceState((s) => ({ ...s, error: errorMsg }));
      onError?.(errorMsg);
      return;
    }

    // Stop existing recognition if any
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;

    recognition.onstart = () => {
      setVoiceState((s) => ({ ...s, isListening: true, error: undefined }));
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResult = event.results[event.results.length - 1];
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const isFinal = lastResult.isFinal;

      setVoiceState({
        isListening: true,
        transcript,
        confidence,
      });

      onResult?.(transcript, isFinal);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMsg = event.error;
      setVoiceState((s) => ({
        ...s,
        error: errorMsg,
        isListening: false,
      }));
      onError?.(errorMsg);
    };

    recognition.onend = () => {
      setVoiceState((s) => ({ ...s, isListening: false }));
      // Auto-restart if continuous mode is enabled and no error
      if (continuous && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // Ignore - recognition already started
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to start voice input";
      setVoiceState((s) => ({ ...s, error: errorMsg }));
      onError?.(errorMsg);
    }
  }, [isSupported, continuous, interimResults, language, onResult, onError]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setVoiceState((s) => ({ ...s, isListening: false }));
  }, []);

  const resetTranscript = useCallback(() => {
    setVoiceState((s) => ({ ...s, transcript: "", confidence: 0 }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    voiceState,
    isSupported,
    startListening,
    stopListening,
    resetTranscript,
  };
}
