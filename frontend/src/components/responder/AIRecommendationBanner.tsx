/**
 * AIRecommendationBanner - Shows AI-generated recommendations
 * Used for equipment suggestions, route advice, safety tips.
 *
 * NOTE: The variant background classes (bg-blue-50 / bg-amber-50 /
 * bg-purple-50) and the DOM nesting around the title are pinned by
 * AIRecommendationBanner.test.tsx (toHaveClass on
 * title.closest('div').parentElement.parentElement). The banner keeps a
 * fixed light palette in every theme, so its inner text colors stay
 * hardcoded-coordinated for AA contrast.
 */

import { Sparkles, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";

interface AIRecommendationBannerProps {
  recommendations: string[];
  title?: string;
  variant?: "info" | "warning" | "equipment";
}

const VARIANTS: Record<
  NonNullable<AIRecommendationBannerProps["variant"]>,
  {
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    titleColor: string;
    textColor: string;
    icon: LucideIcon;
  }
> = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-700",
    titleColor: "text-blue-900",
    textColor: "text-blue-800",
    icon: Sparkles,
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-700",
    titleColor: "text-amber-900",
    textColor: "text-amber-800",
    icon: TriangleAlert,
  },
  equipment: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-700",
    titleColor: "text-purple-900",
    textColor: "text-purple-800",
    icon: Wrench,
  },
};

export default function AIRecommendationBanner({
  recommendations,
  title = "AI Recommendations",
  variant = "info",
}: AIRecommendationBannerProps) {
  if (!recommendations || recommendations.length === 0) return null;

  const colors = VARIANTS[variant];
  const Icon = colors.icon;

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-lg p-4 shadow-1`}>
      {/* Header (keep nesting: title -> row div -> header div -> root) */}
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${colors.iconBg}`}
        >
          <Icon className={`h-4 w-4 ${colors.iconColor}`} />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <h3 className={`truncate text-base font-bold ${colors.titleColor}`}>{title}</h3>
          <span
            className={`shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold ${colors.textColor}`}
          >
            AI
          </span>
        </div>
      </div>

      {/* Recommendations List */}
      <ol className="space-y-2">
        {recommendations.map((rec, index) => (
          <li key={index} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors.iconBg} ${colors.iconColor}`}
            >
              {index + 1}
            </span>
            <p className={`text-base font-medium leading-snug ${colors.textColor}`}>{rec}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
