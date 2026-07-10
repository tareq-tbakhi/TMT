/**
 * StatusBadge — legacy wrapper around the design-system Badge.
 * Keeps the old severity/status props working; prefer components/ui
 * Badge with severityTone()/statusTone() in new code.
 */

import React from "react";
import {
  CircleAlert,
  Info,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Badge, severityTone, statusTone } from "../ui";

type Severity = "critical" | "high" | "medium" | "low";
type HospitalStatus = "operational" | "limited" | "full" | "destroyed";

interface StatusBadgeProps {
  severity?: Severity | string;
  status?: HospitalStatus | string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: Info,
};

const STATUS_LABELS: Record<string, string> = {
  operational: "Operational",
  limited: "Limited",
  full: "Full",
  destroyed: "Destroyed",
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
  severity,
  status,
  size = "md",
  className = "",
}) => {
  const badgeSize = size === "sm" ? "sm" : "md";

  if (status) {
    const key = STATUS_LABELS[status] ? status : "operational";
    return (
      <Badge tone={statusTone(key)} size={badgeSize} dot className={className}>
        {STATUS_LABELS[key]}
      </Badge>
    );
  }

  if (severity) {
    const key = SEVERITY_LABELS[severity] ? severity : "medium";
    const Icon = SEVERITY_ICONS[key];
    return (
      <Badge
        tone={severityTone(key)}
        size={badgeSize}
        icon={<Icon />}
        className={className}
      >
        {SEVERITY_LABELS[key]}
      </Badge>
    );
  }

  return null;
};

export default StatusBadge;
