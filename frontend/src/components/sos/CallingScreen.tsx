/**
 * Real phone call screen — initiates actual phone call via tel: URI
 */

import { useEffect } from "react";

// Emergency operator number (placeholder)
const EMERGENCY_NUMBER = "0599837967";

interface CallingScreenProps {
  onEndCall: () => void;
}

/**
 * Initiates a real phone call to the emergency number.
 */
export function makeEmergencyCall() {
  window.open(`tel:${EMERGENCY_NUMBER}`, "_self");
}

export function CallingScreen({ onEndCall }: CallingScreenProps) {
  // Auto-initiate the real call on mount
  useEffect(() => {
    makeEmergencyCall();
    // Return to triage after a short delay (phone app opens separately)
    const timer = setTimeout(() => {
      onEndCall();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onEndCall]);

  return (
    <div className="min-h-full bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </div>
        <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-green-500/50 animate-ping" />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Calling...</h2>
      <p className="text-green-400 text-lg mb-2">Emergency Operator</p>
      <p className="text-gray-400 text-lg font-mono mb-8">{EMERGENCY_NUMBER}</p>

      <button
        onClick={onEndCall}
        className="px-6 py-3 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-600 transition-colors"
      >
        Back to Chat
      </button>
    </div>
  );
}
