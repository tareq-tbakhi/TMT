/**
 * News Detail - Full article view modal
 */

import type { NewsArticle } from '../../types/newsTypes';
import { CATEGORY_CONFIG, SEVERITY_STYLES } from '../../types/newsTypes';
import { TrustScoreBadge } from './TrustScoreBadge';
import { SourceBadge } from './SourceBadge';

interface NewsDetailProps {
  article: NewsArticle;
  onClose: () => void;
}

/**
 * Format full date and time
 */
function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function NewsDetail({ article, onClose }: NewsDetailProps) {
  const categoryConfig = CATEGORY_CONFIG[article.category];
  const severityStyle = SEVERITY_STYLES[article.severity];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SourceBadge
              platform={article.source_platform}
              author={article.source_author}
              verified={article.verified}
            />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Trust Score + Severity Banner */}
          <div className="flex items-center justify-between mb-4">
            <TrustScoreBadge score={article.trust_score} showLabel size="md" />
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${severityStyle.bg} ${severityStyle.text}`}>
              {article.severity.charAt(0).toUpperCase() + article.severity.slice(1)} Severity
            </span>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 mb-3">
            {article.title}
          </h2>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
            {/* Category */}
            <span className="inline-flex items-center gap-1">
              {categoryConfig.icon} {categoryConfig.label}
            </span>

            {/* Location */}
            {article.location_name && (
              <span className="inline-flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {article.location_name}
                {article.distance_km !== undefined && ` (${article.distance_km.toFixed(1)} km)`}
              </span>
            )}

            {/* Time */}
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDateTime(article.published_at)}
            </span>
          </div>

          {/* Content */}
          <div className="prose prose-sm max-w-none text-gray-700 mb-4">
            <p>{article.content || article.summary}</p>
          </div>

          {/* Tags */}
          {article.relevance_tags.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Related Topics</h4>
              <div className="flex flex-wrap gap-2">
                {article.relevance_tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Engagement */}
          <div className="flex items-center gap-4 text-sm text-gray-500 pt-4 border-t border-gray-100">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {article.engagement_count.toLocaleString()} views
            </span>
            {article.verified && (
              <span className="inline-flex items-center gap-1 text-blue-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                </svg>
                Verified Source
              </span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex gap-3">
            {article.source_url && (
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-4 bg-blue-600 text-white text-sm font-medium rounded-xl text-center hover:bg-blue-700 transition-colors"
              >
                View Original Source
              </a>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
