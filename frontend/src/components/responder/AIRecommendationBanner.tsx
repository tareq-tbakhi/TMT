/**
 * AIRecommendationBanner - Shows AI-generated recommendations
 * Used for equipment suggestions, route advice, safety tips
 */

interface AIRecommendationBannerProps {
  recommendations: string[];
  title?: string;
  variant?: "info" | "warning" | "equipment";
}

const VARIANTS = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    titleColor: "text-blue-800",
    textColor: "text-blue-700",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    titleColor: "text-amber-800",
    textColor: "text-amber-700",
  },
  equipment: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    titleColor: "text-purple-800",
    textColor: "text-purple-700",
  },
};

export default function AIRecommendationBanner({
  recommendations,
  title = "AI Recommendations",
  variant = "info",
}: AIRecommendationBannerProps) {
  if (!recommendations || recommendations.length === 0) return null;

  const colors = VARIANTS[variant];

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-2xl p-4`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 ${colors.iconBg} rounded-lg flex items-center justify-center`}>
          {variant === "equipment" ? (
            <svg className={`w-4 h-4 ${colors.iconColor}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className={`w-4 h-4 ${colors.iconColor}`} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${colors.titleColor}`}>{title}</span>
          <span className={`text-xs ${colors.textColor} bg-white/50 px-2 py-0.5 rounded-full`}>
            AI
          </span>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="space-y-2">
        {recommendations.map((rec, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className={`w-5 h-5 ${colors.iconBg} rounded-full flex items-center justify-center text-xs font-bold ${colors.iconColor} shrink-0 mt-0.5`}>
              {index + 1}
            </span>
            <p className={`text-sm ${colors.textColor} leading-relaxed`}>{rec}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
