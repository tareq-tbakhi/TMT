/**
 * News Card - Individual news item display
 */

import type { NewsArticle } from '../../types/newsTypes';
import { CATEGORY_CONFIG, SEVERITY_STYLES } from '../../types/newsTypes';
import { TrustScoreBadge } from './TrustScoreBadge';
import { SourceBadge } from './SourceBadge';

interface NewsCardProps {
  article: NewsArticle;
  onPress?: (article: NewsArticle) => void;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format engagement count (e.g., "1.2k")
 */
function formatEngagement(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

export function NewsCard({ article, onPress }: NewsCardProps) {
  const categoryConfig = CATEGORY_CONFIG[article.category];
  const severityStyle = SEVERITY_STYLES[article.severity];

  return (
    <div
      onClick={() => onPress?.(article)}
      className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:bg-gray-50"
    >
      {/* Header: Source + Trust Score */}
      <div className="flex items-center justify-between mb-3">
        <SourceBadge
          platform={article.source_platform}
          author={article.source_author}
          verified={article.verified}
        />
        <TrustScoreBadge score={article.trust_score} size="sm" />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-gray-900 text-base leading-snug mb-2">
        {article.title}
      </h3>

      {/* Summary */}
      <p className="text-gray-600 text-sm leading-relaxed mb-3 line-clamp-2">
        {article.summary}
      </p>

      {/* Tags: Category + Severity */}
      <div className="flex items-center gap-2 mb-3">
        {/* Category tag */}
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-700">
          {categoryConfig.icon} {categoryConfig.label}
        </span>

        {/* Severity tag */}
        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${severityStyle.bg} ${severityStyle.text}`}>
          {article.severity.charAt(0).toUpperCase() + article.severity.slice(1)}
        </span>
      </div>

      {/* Footer: Location, Time, Engagement */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {/* Distance */}
          {article.distance_km !== undefined && (
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {article.distance_km.toFixed(1)} km
            </span>
          )}

          {/* Time */}
          <span>{formatRelativeTime(article.published_at)}</span>
        </div>

        {/* Engagement */}
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {formatEngagement(article.engagement_count)}
        </span>
      </div>
    </div>
  );
}
