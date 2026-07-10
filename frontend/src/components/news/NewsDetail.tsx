/**
 * News Detail - Full article view modal
 */

import { BadgeCheck, Clock, Eye, ExternalLink, Info, MapPin, Megaphone, Siren, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { NewsArticle, NewsCategory } from '../../types/newsTypes';
import { CATEGORY_CONFIG } from '../../types/newsTypes';
import { Badge, Button, Modal, severityTone } from '../ui';
import { TrustScoreBadge } from './TrustScoreBadge';
import { SourceBadge } from './SourceBadge';

interface NewsDetailProps {
  article: NewsArticle;
  onClose: () => void;
}

/** Category → lucide icon (replaces emoji glyphs). */
const CATEGORY_ICONS: Record<NewsCategory, LucideIcon> = {
  threat: TriangleAlert,
  warning: Siren,
  update: Megaphone,
  info: Info,
};

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
  const CategoryIcon = CATEGORY_ICONS[article.category];

  return (
    <Modal
      open
      onClose={onClose}
      title={article.title}
      footer={
        <div className="flex w-full flex-wrap gap-3">
          {article.source_url && (
            <a
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-5 text-base font-semibold text-on-accent shadow-1 transition-colors hover:bg-accent-hover focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <ExternalLink aria-hidden="true" className="h-5 w-5" />
              View Original Source
            </a>
          )}
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Close
          </Button>
        </div>
      }
    >
      {/* Source + Trust Score + Severity Banner */}
      <div className="mb-4">
        <SourceBadge
          platform={article.source_platform}
          author={article.source_author}
          verified={article.verified}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <TrustScoreBadge score={article.trust_score} showLabel size="md" />
        <Badge tone={severityTone(article.severity)}>
          {article.severity.charAt(0).toUpperCase() + article.severity.slice(1)} Severity
        </Badge>
      </div>

      {/* Meta info */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-ink-muted">
        {/* Category */}
        <span className="inline-flex items-center gap-1.5">
          <CategoryIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
          {categoryConfig.label}
        </span>

        {/* Location */}
        {article.location_name && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
            {article.location_name}
            {article.distance_km !== undefined && ` (${article.distance_km.toFixed(1)} km)`}
          </span>
        )}

        {/* Time */}
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0" />
          {formatDateTime(article.published_at)}
        </span>
      </div>

      {/* Content */}
      <p className="mb-4 text-base leading-relaxed text-ink">
        {article.content || article.summary}
      </p>

      {/* Tags */}
      {article.relevance_tags.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
            Related Topics
          </h3>
          <div className="flex flex-wrap gap-2">
            {article.relevance_tags.map((tag) => (
              <Badge key={tag} tone="neutral" size="sm">
                #{tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Engagement */}
      <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-4 text-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <Eye aria-hidden="true" className="h-4 w-4 shrink-0" />
          {article.engagement_count.toLocaleString()} views
        </span>
        {article.verified && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-info">
            <BadgeCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
            Verified Source
          </span>
        )}
      </div>
    </Modal>
  );
}
