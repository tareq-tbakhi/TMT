/**
 * Mock calling screen for demo purposes
 */

import { useState, useEffect } from "react";

interface CallingScreenProps {
  onEndCall: () => void;
}

export function CallingScreen({ onEndCall }: CallingScreenProps) {
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration((d) => d + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-full bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Calling animation */}
      <div className="relative mb-8">
        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center animate-pulse">
          <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        </div>
        {/* Pulse rings */}
        <div className="absolute inset-0 w-24 h-24 rounded-full border-4 border-green-500/50 animate-ping" />
      </div>

      {/* Status */}
      <h2 className="text-2xl font-bold text-white mb-2">
        Connecting...
      </h2>
      <p className="text-green-400 text-lg mb-2">
        Emergency Operator
      </p>
      <p className="text-gray-400 text-sm mb-8">
        {formatDuration(callDuration)}
      </p>

      {/* Demo notice */}
      <div className="bg-amber-500/20 border border-amber-500/50 rounded-xl px-4 py-3 mb-8 max-w-xs">
        <p className="text-amber-200 text-sm text-center">
          Demo Mode: This is a simulated call for demonstration purposes
        </p>
      </div>

      {/* End call button */}
      <button
        onClick={onEndCall}
        className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 active:bg-red-800 transition-colors"
        aria-label="End call"
      >
        <svg className="w-8 h-8 text-white transform rotate-135" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
      </button>
      <p className="text-gray-500 text-sm mt-3">End Call</p>
    </div>
  );
}
