/**
 * Timeout warning overlay - "Are you there?"
 * If user doesn't respond, auto-triggers urgent call
 */

interface TimeoutOverlayProps {
  secondsRemaining: number;
  onTap: () => void;
  onCallNow: () => void;
}

export function TimeoutOverlay({
  secondsRemaining,
  onTap,
  onCallNow,
}: TimeoutOverlayProps) {
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onTap}
    >
      <div
        className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pulsing warning icon */}
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5 animate-pulse">
          <svg
            className="w-10 h-10 text-red-600"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Are you there?
        </h2>

        <p className="text-gray-600 mb-2">
          We haven't heard from you.
        </p>

        <p className="text-red-600 font-semibold mb-4">
          Auto-calling operator in:
        </p>

        {/* Countdown */}
        <div className="text-5xl font-bold text-red-600 mb-6">
          {secondsRemaining}s
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={onTap}
            className="w-full bg-blue-600 text-white font-bold py-4 px-6 rounded-xl text-lg hover:bg-blue-700 active:bg-blue-800 transition-colors"
          >
            I'M HERE - Continue
          </button>

          <button
            onClick={onCallNow}
            className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold py-4 px-6 rounded-xl flex items-center justify-center gap-2 hover:from-red-700 hover:to-red-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
            Call Operator Now
          </button>
        </div>

        {/* Tap anywhere hint */}
        <p className="text-xs text-gray-400 mt-4">
          Tap anywhere on screen if you can't reach the button
        </p>
      </div>
    </div>
  );
}
