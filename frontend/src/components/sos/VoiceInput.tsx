/**
 * Voice input component with waveform animation
 */

import { useEffect, useState } from "react";
import type { VoiceState } from "../../types/sosTypes";

interface VoiceInputProps {
  voiceState: VoiceState;
  isSupported: boolean;
  onToggle: () => void;
}

export function VoiceInput({ voiceState, isSupported, onToggle }: VoiceInputProps) {
  const { isListening, transcript, error } = voiceState;

  // Animated waveform bars (more bars for better visual)
  const [bars, setBars] = useState<number[]>([0.3, 0.4, 0.5, 0.6, 0.7, 0.6, 0.5, 0.4, 0.3, 0.5, 0.6, 0.4]);

  useEffect(() => {
    if (!isListening) {
      setBars([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]);
      return;
    }

    const interval = setInterval(() => {
      setBars(bars.map(() => 0.15 + Math.random() * 0.85));
    }, 80);

    return () => clearInterval(interval);
  }, [isListening]);

  if (!isSupported) {
    return (
      <div className="bg-amber-50 rounded-2xl p-4 mx-4 text-center border border-amber-200">
        <p className="text-amber-700 text-sm">
          Voice input not supported. Please use text or quick responses.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl mx-4 transition-all duration-300 ${
        isListening
          ? "bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 shadow-lg"
          : "bg-white border-2 border-gray-200 hover:border-blue-300 hover:shadow-md"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-4"
        aria-label={isListening ? "Stop listening" : "Start listening"}
      >
        {/* Microphone button */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
            isListening
              ? "bg-blue-600 text-white shadow-lg shadow-blue-300 scale-105"
              : "bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
          }`}
        >
          {isListening ? (
            // Stop icon when listening
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            // Microphone icon when idle
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V22h-2v-6.07z" />
            </svg>
          )}
        </div>

        {/* Center content - Waveform or instruction */}
        <div className="flex-1 min-w-0">
          {isListening ? (
            <div className="space-y-2">
              {/* Waveform animation */}
              <div className="flex items-end justify-center gap-1 h-10">
                {bars.map((height, i) => (
                  <div
                    key={i}
                    className="w-1.5 bg-blue-500 rounded-full transition-all duration-75"
                    style={{ height: `${height * 100}%` }}
                  />
                ))}
              </div>
              {/* Transcript preview */}
              {transcript ? (
                <p className="text-sm text-blue-700 truncate text-center font-medium">
                  "{transcript}"
                </p>
              ) : (
                <p className="text-xs text-blue-600 text-center">
                  Listening... speak now
                </p>
              )}
            </div>
          ) : (
            <div className="text-center">
              {error ? (
                <p className="text-red-500 text-sm">{error}</p>
              ) : (
                <>
                  <p className="text-gray-800 font-semibold text-base">
                    Tap to speak
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Or use quick responses below
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right side - Status indicator */}
        <div className={`shrink-0 transition-all duration-300 ${isListening ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-xs font-semibold">LIVE</span>
          </div>
        </div>
      </button>
    </div>
  );
}
