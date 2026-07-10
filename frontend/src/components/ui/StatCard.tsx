/**
 * StatCard — KPI tile for dashboards.
 */

import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { BadgeTone } from "./Badge";

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Optional lucide icon element. */
  icon?: React.ReactNode;
  tone?: Extract<BadgeTone, "neutral" | "accent" | "success" | "warning" | "danger" | "info">;
  /** Percent or delta text, e.g. "+12% today". */
  trend?: { value: React.ReactNode; direction: "up" | "down"; positive?: boolean };
  /** Extra line under the value. */
  hint?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

const ICON_TONES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "bg-surface-2 text-ink-muted",
  accent: "bg-accent-soft text-on-accent-soft",
  success: "bg-success-soft text-on-success-soft",
  warning: "bg-warning-soft text-on-warning-soft",
  danger: "bg-danger-soft text-on-danger-soft",
  info: "bg-info-soft text-on-info-soft",
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  tone = "accent",
  trend,
  hint,
  loading = false,
  className = "",
}) => (
  <div
    className={`rounded-lg border border-edge bg-surface p-4 shadow-1 sm:p-5 ${className}`}
  >
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      {icon && (
        <span
          aria-hidden="true"
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md [&>svg]:h-5 [&>svg]:w-5 ${ICON_TONES[tone]}`}
        >
          {icon}
        </span>
      )}
    </div>
    {loading ? (
      <div className="loading-skeleton mt-2 h-9 w-24 rounded-md" aria-hidden="true" />
    ) : (
      <p className="mt-1 text-3xl font-bold tracking-tight text-ink">{value}</p>
    )}
    {(trend || hint) && (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {trend && (
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              (trend.positive ?? trend.direction === "up")
                ? "text-success"
                : "text-danger"
            }`}
          >
            {trend.direction === "up" ? (
              <TrendingUp aria-hidden="true" className="h-4 w-4" />
            ) : (
              <TrendingDown aria-hidden="true" className="h-4 w-4" />
            )}
            {trend.value}
          </span>
        )}
        {hint && <span className="text-ink-faint">{hint}</span>}
      </div>
    )}
  </div>
);

export default StatCard;
