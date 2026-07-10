/**
 * Real phone call screen — initiates actual phone call via tel: URI
 */

import { useEffect } from "react";
import { PhoneCall } from "lucide-react";
import { Button } from "../ui";

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
    <div className="flex min-h-full flex-col items-center justify-center p-4">
      <div className="relative mb-8" aria-hidden="true">
        <div className="flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-success text-white shadow-2">
          <PhoneCall className="h-12 w-12" />
        </div>
        <div className="absolute inset-0 h-24 w-24 animate-ping rounded-full border-4 border-success/50" />
      </div>

      <h2 className="mb-2 text-2xl font-bold text-ink">Calling...</h2>
      <p className="mb-2 text-lg font-semibold text-success">Emergency Operator</p>
      <p className="mb-8 font-mono text-lg text-ink-muted" dir="ltr">{EMERGENCY_NUMBER}</p>

      <Button variant="secondary" size="lg" onClick={onEndCall}>
        Back to Chat
      </Button>
    </div>
  );
}
