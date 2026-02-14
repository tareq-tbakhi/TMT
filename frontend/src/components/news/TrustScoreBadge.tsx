/**
 * Trust Score Badge - Visual indicator of news source reliability
 */

import { getTrustTier, TRUST_TIER_STYLES } from '../../types/newsTypes';

interface TrustScoreBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function TrustScoreBadge({ score, showLabel = false, size = 'md' }: TrustScoreBadgeProps) {
  const tier = getTrustTier(score);
  const styles = TRUST_TIER_STYLES[tier];

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-xs'
    : 'px-2 py-1 text-sm';

  return (
    <div className={`inline-flex items-center gap-1 rounded-full font-medium ${styles.bg} ${styles.text} ${sizeClasses}`}>
      <span>{score}</span>
      {showLabel && <span className="hidden sm:inline">• {styles.label}</span>}
    </div>
  );
}
