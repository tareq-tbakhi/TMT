/**
 * Urgent Call button - always visible red button at bottom
 */

import { ChevronRight, PhoneCall } from "lucide-react";

interface UrgentCallButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export function UrgentCallButton({ onPress, disabled = false }: UrgentCallButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label="Urgent call to operator"
      className={`flex min-h-16 w-full items-center justify-center gap-4 rounded-lg bg-sos px-4 py-3 text-on-sos shadow-2 transition-all focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
        disabled
          ? "cursor-not-allowed opacity-55"
          : "hover:bg-sos-hover active:scale-[0.98]"
      }`}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-on-sos/20"
      >
        <PhoneCall className="h-6 w-6" />
      </span>
      <span className="text-start">
        <span className="block text-lg font-black tracking-wide">URGENT CALL</span>
        <span className="block text-sm font-medium opacity-90">Speak with an operator now</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-5 w-5 opacity-70 rtl:-scale-x-100" />
    </button>
  );
}
