/**
 * Timeout warning overlay - "Are you there?"
 * If user doesn't respond, auto-triggers urgent call
 */

import { PhoneCall, TriangleAlert } from "lucide-react";
import { Button } from "../ui";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onTap}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="timeout-overlay-title"
        aria-describedby="timeout-overlay-desc"
        className="w-full max-w-sm rounded-xl border border-edge bg-surface p-6 text-center shadow-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Pulsing warning icon */}
        <span
          aria-hidden="true"
          className="mx-auto mb-5 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-danger-soft text-danger"
        >
          <TriangleAlert className="h-10 w-10" />
        </span>

        <h2 id="timeout-overlay-title" className="mb-2 text-2xl font-bold text-ink">
          Are you there?
        </h2>

        <p id="timeout-overlay-desc" className="mb-2 text-base text-ink-muted">
          We haven't heard from you.
        </p>

        <p className="mb-4 text-base font-bold text-danger">
          Auto-calling operator in:
        </p>

        {/* Countdown */}
        <p className="mb-6 text-5xl font-black tabular-nums text-danger" role="timer">
          {secondsRemaining}s
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          <Button size="xl" fullWidth onClick={onTap}>
            I'M HERE - Continue
          </Button>

          <Button size="xl" fullWidth variant="sos" icon={<PhoneCall />} onClick={onCallNow}>
            Call Operator Now
          </Button>
        </div>

        {/* Tap anywhere hint */}
        <p className="mt-4 text-sm text-ink-muted">
          Tap anywhere on screen if you can't reach the button
        </p>
      </div>
    </div>
  );
}
