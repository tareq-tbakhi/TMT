/**
 * News Card - Individual news item display
 */

import { Clock, Eye, Info, MapPin, Megaphone, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { NewsArticle, NewsCategory } from '../../types/newsTypes';
import { CATEGORY_CONFIG } from '../../types/newsTypes';
import { Badge, Card, severityTone } from '../ui';
import { TrustScoreBadge } from './TrustScoreBadge';
import { SourceBadge } from './SourceBadge';

interface NewsCardProps {
  article: NewsArticle;
  onPress?: (article: NewsArticle) => void;
}

/** Category → lucide icon (replaces emoji glyphs). */
const CATEGORY_ICONS: Record<NewsCategory, LucideIcon> = {
  threat: TriangleAlert,
  warning: Siren,
  update: Megaphone,
  info: Info,
};

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
  const CategoryIcon = CATEGORY_ICONS[article.category];

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      onClick={() => onPress?.(article)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPress?.(article);
        }
      }}
      aria-label={article.title}
    >
      {/* Header: Source + Trust Score */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <SourceBadge
          platform={article.source_platform}
          author={article.source_author}
          verified={article.verified}
        />
        <TrustScoreBadge score={article.trust_score} size="sm" />
      </div>

      {/* Title */}
      <h3 className="mb-2 text-base font-bold leading-snug text-ink">
        {article.title}
      </h3>

      {/* Summary */}
      <p className="mb-3 line-clamp-2 text-base leading-relaxed text-ink-muted">
        {article.summary}
      </p>

      {/* Tags: Category + Severity */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* Category tag */}
        <Badge tone="neutral" size="sm" icon={<CategoryIcon />}>
          {categoryConfig.label}
        </Badge>

        {/* Severity tag */}
        <Badge tone={severityTone(article.severity)} size="sm">
          {article.severity.charAt(0).toUpperCase() + article.severity.slice(1)}
        </Badge>
      </div>

      {/* Footer: Location, Time, Engagement */}
      <div className="flex items-center justify-between gap-2 text-sm text-ink-muted">
        <div className="flex min-w-0 items-center gap-3">
          {/* Distance */}
          {article.distance_km !== undefined && (
            <span className="flex shrink-0 items-center gap-1">
              <MapPin aria-hidden="true" className="h-4 w-4" />
              {article.distance_km.toFixed(1)} km
            </span>
          )}

          {/* Time */}
          <span className="flex min-w-0 items-center gap-1">
            <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{formatRelativeTime(article.published_at)}</span>
          </span>
        </div>

        {/* Engagement */}
        <span className="flex shrink-0 items-center gap-1">
          <Eye aria-hidden="true" className="h-4 w-4" />
          {formatEngagement(article.engagement_count)}
          <span className="sr-only">views</span>
        </span>
      </div>
    </Card>
  );
}
