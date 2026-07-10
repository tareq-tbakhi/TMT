/**
 * Badge — status & severity pills.
 *
 * Soft (default) badges use token soft backgrounds with AA-contrast text.
 * `solid` badges are for map markers / dark overlays.
 * Severity levels map to the crisis color scale.
 */

import React from "react";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  solid?: boolean;
  size?: "sm" | "md";
  /** Show a leading status dot. */
  dot?: boolean;
  icon?: React.ReactNode;
}

const SOFT: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-ink-muted border border-edge",
  accent: "bg-accent-soft text-on-accent-soft border border-transparent",
  success: "bg-success-soft text-on-success-soft border border-transparent",
  warning: "bg-warning-soft text-on-warning-soft border border-transparent",
  danger: "bg-danger-soft text-on-danger-soft border border-transparent",
  info: "bg-info-soft text-on-info-soft border border-transparent",
  critical: "bg-sev-critical-soft text-on-sev-critical-soft border border-transparent",
  high: "bg-sev-high-soft text-on-sev-high-soft border border-transparent",
  medium: "bg-sev-medium-soft text-on-sev-medium-soft border border-transparent",
  low: "bg-sev-low-soft text-on-sev-low-soft border border-transparent",
};

const SOLID: Record<BadgeTone, string> = {
  neutral: "bg-surface-3 text-ink",
  accent: "bg-accent text-on-accent",
  success: "bg-success text-white",
  warning: "bg-warning text-white",
  danger: "bg-danger text-white",
  info: "bg-info text-white",
  critical: "bg-sev-critical text-white",
  high: "bg-sev-high text-white",
  medium: "bg-sev-medium text-white",
  low: "bg-sev-low text-white",
};

const DOT_COLOR: Record<BadgeTone, string> = {
  neutral: "bg-ink-faint",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

export const Badge: React.FC<BadgeProps> = ({
  tone = "neutral",
  solid = false,
  size = "md",
  dot = false,
  icon,
  className = "",
  children,
  ...rest
}) => (
  <span
    className={[
      "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap",
      size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
      solid ? SOLID[tone] : SOFT[tone],
      className,
    ].join(" ")}
    {...rest}
  >
    {dot && (
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${solid ? "bg-white/80" : DOT_COLOR[tone]}`}
      />
    )}
    {icon && (
      <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-[1em] [&>svg]:w-[1em]">
        {icon}
      </span>
    )}
    {children}
  </span>
);

/** Maps API severity strings to badge tones. */
export function severityTone(severity: string | null | undefined): BadgeTone {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
      return "low";
    default:
      return "neutral";
  }
}

/** Maps facility/case status strings to badge tones. */
export function statusTone(status: string | null | undefined): BadgeTone {
  switch ((status ?? "").toLowerCase()) {
    case "operational":
    case "active":
    case "completed":
    case "resolved":
    case "online":
      return "success";
    case "limited":
    case "pending":
    case "en_route":
    case "in_progress":
      return "warning";
    case "full":
    case "critical":
    case "cancelled":
    case "destroyed":
    case "offline":
      return "danger";
    default:
      return "neutral";
  }
}

export default Badge;
