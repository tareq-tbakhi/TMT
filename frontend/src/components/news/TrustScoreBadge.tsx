/**
 * Trust Score Badge - Visual indicator of news source reliability
 */

import { ShieldCheck } from 'lucide-react';
import { getTrustTier, TRUST_TIER_STYLES, type TrustTier } from '../../types/newsTypes';
import { Badge, type BadgeTone } from '../ui';

interface TrustScoreBadgeProps {
  score: number;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

/** Maps trust tiers to design-system badge tones. */
const TIER_TONE: Record<TrustTier, BadgeTone> = {
  high: 'success',
  trusted: 'info',
  moderate: 'warning',
  low: 'high',
  unverified: 'danger',
};

export function TrustScoreBadge({ score, showLabel = false, size = 'md' }: TrustScoreBadgeProps) {
  const tier = getTrustTier(score);
  const styles = TRUST_TIER_STYLES[tier];

  return (
    <Badge
      tone={TIER_TONE[tier]}
      size={size}
      icon={<ShieldCheck />}
      aria-label={`Trust score ${score} out of 100 — ${styles.label}`}
    >
      <span>{score}</span>
      {showLabel && <span className="hidden sm:inline">• {styles.label}</span>}
    </Badge>
  );
}
