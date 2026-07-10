/**
 * StatsCard — legacy wrapper around the design-system StatCard.
 * Maps the old color/trend props onto token-driven StatCard tones so
 * existing imports keep working; prefer components/ui StatCard directly.
 */

import React from "react";
import { StatCard, type StatCardProps as UiStatCardProps } from "../ui";

type TrendDirection = "up" | "down" | "neutral";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: TrendDirection;
  trendValue?: string;
  color?: "blue" | "red" | "green" | "yellow" | "purple" | "orange";
  className?: string;
}

const COLOR_TO_TONE: Record<string, NonNullable<UiStatCardProps["tone"]>> = {
  blue: "accent",
  red: "danger",
  green: "success",
  yellow: "warning",
  purple: "info",
  orange: "warning",
};

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  trend,
  trendValue,
  color = "blue",
  className = "",
}) => (
  <StatCard
    label={title}
    value={value}
    icon={icon}
    tone={COLOR_TO_TONE[color] ?? "accent"}
    trend={
      trend && trend !== "neutral" && trendValue
        ? { value: trendValue, direction: trend }
        : undefined
    }
    hint={trend === "neutral" && trendValue ? trendValue : undefined}
    className={className}
  />
);

export default StatsCard;
