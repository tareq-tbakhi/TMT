import React from "react";

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

const colorMap: Record<string, { bg: string; iconBg: string; text: string }> = {
  blue: { bg: "bg-blue-50", iconBg: "bg-blue-100", text: "text-blue-600" },
  red: { bg: "bg-red-50", iconBg: "bg-red-100", text: "text-red-600" },
  green: { bg: "bg-green-50", iconBg: "bg-green-100", text: "text-green-600" },
  yellow: { bg: "bg-yellow-50", iconBg: "bg-yellow-100", text: "text-yellow-600" },
  purple: { bg: "bg-purple-50", iconBg: "bg-purple-100", text: "text-purple-600" },
  orange: { bg: "bg-orange-50", iconBg: "bg-orange-100", text: "text-orange-600" },
};

const trendIcons: Record<TrendDirection, { icon: string; color: string }> = {
  up: { icon: "\u2191", color: "text-green-600" },
  down: { icon: "\u2193", color: "text-red-600" },
  neutral: { icon: "\u2192", color: "text-gray-500" },
};

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  trend,
  trendValue,
  color = "blue",
  className = "",
}) => {
  const colors = colorMap[color] ?? colorMap.blue;
  const trendInfo = trend ? trendIcons[trend] : null;

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {trend && trendValue && trendInfo && (
            <div className="mt-2 flex items-center gap-1">
              <span className={`text-sm font-medium ${trendInfo.color}`}>
                {trendInfo.icon} {trendValue}
              </span>
            </div>
          )}
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${colors.iconBg}`}
        >
          <span className={`text-xl ${colors.text}`}>{icon}</span>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
