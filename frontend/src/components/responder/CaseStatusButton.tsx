/**
 * CaseStatusButton - Large action button for status updates
 * Emergency-optimized: large touch target, clear feedback
 */

import type { CaseStatus } from "../../types/responderTypes";
import { RESPONDER_COLORS, type ResponderType } from "../../store/authStore";

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

function ButtonIcon({ icon }: { icon: string }) {
  switch (icon) {
    case "check":
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
    case "navigation":
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      );
    case "location":
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
        </svg>
      );
    case "truck":
      return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
        </svg>
      );
    case "flag":
      return (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
        </svg>
      );
    default:
      return null;
  }
}

export default function CaseStatusButton({
  currentStatus,
  responderType,
  onStatusChange,
  disabled = false,
}: CaseStatusButtonProps) {
  const colors = RESPONDER_COLORS[responderType];
  const statusInfo = STATUS_FLOW[currentStatus];

  if (!statusInfo.next) {
    // Case completed - show success state
    return (
      <div className="bg-green-100 rounded-2xl p-4 flex items-center justify-center gap-3">
        <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <span className="text-green-800 font-bold text-lg">Case Completed</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onStatusChange(statusInfo.next!)}
      disabled={disabled}
      className={`w-full bg-gradient-to-r ${colors.gradient} text-white font-bold py-5 px-6 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed shadow-lg`}
      style={{ minHeight: "72px" }} // Large touch target
    >
      <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
        <ButtonIcon icon={statusInfo.icon} />
      </div>
      <span className="text-xl">{statusInfo.label}</span>
    </button>
  );
}
