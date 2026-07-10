/**
 * NoCaseView - Shown when no active case is assigned
 * Displays standby status with connection indicator (icon + text,
 * never color alone). Token-driven except where tests pin classes.
 */

import { RadioTower, Wifi, WifiOff } from "lucide-react";
import { RESPONDER_LABELS, type ResponderType } from "../../store/authStore";
import { Button } from "../ui";

interface NoCaseViewProps {
  responderType: ResponderType;
  isConnected: boolean;
  onLoadDemo?: () => void;
}

export default function NoCaseView({ responderType, isConnected, onLoadDemo }: NoCaseViewProps) {
  const label = RESPONDER_LABELS[responderType];

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      {/* Status icon */}
      <div
        aria-hidden="true"
        className={`mb-6 flex h-24 w-24 items-center justify-center rounded-full ${
          isConnected
            ? "bg-accent-soft text-on-accent-soft"
            : "bg-danger-soft text-on-danger-soft"
        }`}
      >
        {isConnected ? (
          <RadioTower className="h-12 w-12" />
        ) : (
          <WifiOff className="h-12 w-12" />
        )}
      </div>

      {/* Status Text */}
      <h2 className="mb-2 text-2xl font-bold text-ink">
        {isConnected ? "Standing By" : "Connection Lost"}
      </h2>
      <p className="mb-6 max-w-xs text-base text-ink-muted">
        {isConnected
          ? `Waiting for ${label.toLowerCase()} dispatch. You'll be notified when a case is assigned.`
          : "Trying to reconnect to dispatch. Please check your connection."}
      </p>

      {/* Connection Status pill.
          NOTE: bg-green-100 / bg-red-100 (with coordinated text colors) are
          pinned by NoCaseView.test.tsx via toHaveClass — keep hardcoded. The
          pill background stays light in every theme, so the fixed dark
          green/red text keeps AA contrast. */}
      <div
        className={`flex min-h-11 items-center gap-2 rounded-full px-4 py-2 ${
          isConnected ? "bg-green-100" : "bg-red-100"
        }`}
      >
        {isConnected ? (
          <Wifi aria-hidden="true" className="h-5 w-5 text-green-700" />
        ) : (
          <WifiOff aria-hidden="true" className="h-5 w-5 animate-pulse text-red-700" />
        )}
        <span className={`font-semibold ${isConnected ? "text-green-700" : "text-red-700"}`}>
          {isConnected ? "Connected to Dispatch" : "Reconnecting..."}
        </span>
      </div>

      {/* Demo Button (for development) */}
      {onLoadDemo && (
        <Button variant="secondary" size="lg" className="mt-8" onClick={onLoadDemo}>
          Load Demo Case
        </Button>
      )}
    </div>
  );
}
