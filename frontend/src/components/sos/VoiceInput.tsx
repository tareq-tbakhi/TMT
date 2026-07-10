/**
 * Voice input component with waveform animation
 */

import { useEffect, useState } from "react";
import { Mic, Square, TriangleAlert } from "lucide-react";
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
      <div className="mx-4 flex items-center gap-2.5 rounded-lg border border-warning/30 bg-warning-soft p-4">
        <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-on-warning-soft" />
        <p className="text-sm font-medium text-on-warning-soft">
          Voice input not supported. Please use text or quick responses.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`mx-4 rounded-lg border-2 transition-colors duration-300 ${
        isListening
          ? "border-danger bg-danger-soft shadow-2"
          : "border-edge-strong bg-surface hover:border-accent"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isListening ? "Stop listening" : "Start listening"}
        aria-pressed={isListening}
        className="flex min-h-14 w-full items-center gap-4 rounded-lg p-4 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
      >
        {/* Microphone button */}
        <span
          aria-hidden="true"
          className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
            isListening
              ? "bg-danger text-white shadow-2"
              : "bg-accent-soft text-on-accent-soft"
          }`}
        >
          {isListening ? (
            // Stop icon when listening
            <Square className="h-7 w-7 fill-current" />
          ) : (
            // Microphone icon when idle
            <Mic className="h-7 w-7" />
          )}
        </span>

        {/* Center content - Waveform or instruction */}
        <span className="min-w-0 flex-1">
          {isListening ? (
            <span className="flex flex-col gap-2">
              {/* Waveform animation */}
              <span aria-hidden="true" className="flex h-10 items-end justify-center gap-1">
                {bars.map((height, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-danger transition-all duration-75"
                    style={{ height: `${height * 100}%` }}
                  />
                ))}
              </span>
              {/* Transcript preview */}
              {transcript ? (
                <span className="block truncate text-center text-sm font-semibold text-on-danger-soft">
                  "{transcript}"
                </span>
              ) : (
                <span className="block text-center text-sm font-medium text-on-danger-soft">
                  Listening... speak now
                </span>
              )}
            </span>
          ) : (
            <span className="block text-center">
              {error ? (
                <span className="text-sm font-medium text-danger">{error}</span>
              ) : (
                <>
                  <span className="block text-base font-bold text-ink">
                    Tap to speak
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    Or use quick responses below
                  </span>
                </>
              )}
            </span>
          )}
        </span>

        {/* Right side - Recording status indicator */}
        <span
          className={`shrink-0 transition-opacity duration-300 ${
            isListening ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden={!isListening}
        >
          <span className="flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-white">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-white" />
            <span className="text-xs font-bold tracking-wide">REC</span>
          </span>
        </span>
      </button>
    </div>
  );
}
