/**
 * Urgent Call button - always visible red button at bottom
 */

interface UrgentCallButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function UrgentCallButton({ onPress, disabled = false }: UrgentCallButtonProps) {
  return (
    <button
      onClick={onPress}
      disabled={disabled}
      className={`w-full bg-gradient-to-r from-red-600 to-red-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-4 transition-all shadow-lg shadow-red-200 ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:from-red-700 hover:to-red-800 active:scale-[0.98]"
      }`}
      aria-label="Urgent call to operator"
    >
      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
      </div>
      <div className="text-left">
        <div className="text-lg font-bold tracking-wide">URGENT CALL</div>
        <div className="text-sm font-normal opacity-90">Speak with an operator now</div>
      </div>
      <svg className="w-5 h-5 opacity-60" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </button>
  );
}
