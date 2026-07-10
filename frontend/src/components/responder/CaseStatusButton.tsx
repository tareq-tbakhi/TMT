/**
 * CaseStatusButton - Large action button for status updates
 * Emergency-optimized: 72px touch target, one obvious action, accent tokens.
 *
 * NOTE: This stays a native <button> with the native `disabled` attribute and
 * an inline minHeight of 72px — both are pinned by CaseStatusButton.test.tsx
 * (toBeDisabled / toHaveStyle), so do not swap it for the ui <Button>.
 */

import {
  Check,
  CircleCheck,
  Flag,
  MapPin,
  Navigation,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { CaseStatus } from "../../types/responderTypes";
import { type ResponderType } from "../../store/authStore";

interface CaseStatusButtonProps {
  currentStatus: CaseStatus;
  responderType: ResponderType;
  onStatusChange: (newStatus: CaseStatus) => void;
  disabled?: boolean;
}

// Status flow: pending -> accepted -> en_route -> on_scene -> transporting -> completed
const STATUS_FLOW: Record<CaseStatus, { next: CaseStatus | null; label: string; icon: string }> = {
  pending: { next: "accepted", label: "Accept Case", icon: "check" },
  accepted: { next: "en_route", label: "Start Route", icon: "navigation" },
  en_route: { next: "on_scene", label: "Arrived on Scene", icon: "location" },
  on_scene: { next: "transporting", label: "Start Transport", icon: "truck" },
  transporting: { next: "completed", label: "Complete Case", icon: "flag" },
  completed: { next: null, label: "Completed", icon: "check" },
};

/** Flow icon keys -> lucide components (design system: lucide only). */
const FLOW_ICONS: Record<string, LucideIcon> = {
  check: Check,
  navigation: Navigation,
  location: MapPin,
  truck: Truck,
  flag: Flag,
};

export default function CaseStatusButton({
  currentStatus,
  responderType: _responderType,
  onStatusChange,
  disabled = false,
}: CaseStatusButtonProps) {
  const statusInfo = STATUS_FLOW[currentStatus];

  if (!statusInfo.next) {
    // Case completed - show success state (not a button; tests assert this)
    return (
      <div
        role="status"
        className="flex min-h-14 items-center justify-center gap-3 rounded-lg bg-success-soft p-4 text-on-success-soft shadow-1"
      >
        <CircleCheck aria-hidden="true" className="h-7 w-7 shrink-0" />
        <span className="text-lg font-bold">Case Completed</span>
      </div>
    );
  }

  const Icon = FLOW_ICONS[statusInfo.icon] ?? Check;

  return (
    <button
      type="button"
      onClick={() => onStatusChange(statusInfo.next!)}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-3 rounded-lg bg-accent px-6 py-4 text-xl font-bold text-on-accent shadow-2 transition-transform hover:bg-accent-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
      style={{ minHeight: "72px" }} // Large touch target (pinned by tests)
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-on-accent/15"
      >
        <Icon className="h-6 w-6" />
      </span>
      {statusInfo.label}
    </button>
  );
}
