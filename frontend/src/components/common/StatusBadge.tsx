import React from "react";

type Severity = "critical" | "high" | "medium" | "low";
type HospitalStatus = "operational" | "limited" | "full" | "destroyed";

interface StatusBadgeProps {
  severity?: Severity | string;
  status?: HospitalStatus | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const severityStyles: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-800", label: "Critical" },
  high: { bg: "bg-orange-100", text: "text-orange-800", label: "High" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-800", label: "Medium" },
  low: { bg: "bg-blue-100", text: "text-blue-800", label: "Low" },
};

const statusStyles: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  operational: {
    bg: "bg-green-100",
    text: "text-green-800",
    dot: "bg-green-500",
    label: "Operational",
  },
  limited: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    dot: "bg-yellow-500",
    label: "Limited",
  },
  full: {
    bg: "bg-red-100",
    text: "text-red-800",
    dot: "bg-red-500",
    label: "Full",
  },
  destroyed: {
    bg: "bg-gray-200",
    text: "text-gray-800",
    dot: "bg-gray-700",
    label: "Destroyed",
  },
};

const sizeClasses: Record<string, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
  severity,
  status,
  size = "md",
  className = "",
}) => {
  if (status) {
    const style = statusStyles[status] ?? statusStyles.operational;
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses[size]} ${className}`}
      >
        <span className={`inline-block h-2 w-2 rounded-full ${style.dot}`} />
        {style.label}
      </span>
    );
  }

  if (severity) {
    const style = severityStyles[severity] ?? severityStyles.medium;
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${style.bg} ${style.text} ${sizeClasses[size]} ${className}`}
      >
        {style.label}
      </span>
    );
  }

  return null;
};

export default StatusBadge;
