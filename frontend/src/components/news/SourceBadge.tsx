/**
 * Source Badge - Shows platform icon and author
 */

import { BadgeCheck, Bird, Camera, Globe, Send, Users, type LucideIcon } from 'lucide-react';
import type { SourcePlatform } from '../../types/newsTypes';

interface SourceBadgeProps {
  platform: SourcePlatform;
  author?: string;
  verified?: boolean;
}

/** Platform → lucide icon (replaces emoji glyphs). */
const PLATFORM_ICONS: Record<SourcePlatform, LucideIcon> = {
  twitter: Bird,
  telegram: Send,
  facebook: Users,
  instagram: Camera,
  other: Globe,
};

export function SourceBadge({ platform, author, verified }: SourceBadgeProps) {
  const Icon = PLATFORM_ICONS[platform];

  return (
    <div className="flex items-center gap-1.5 text-sm text-ink-muted">
      <Icon aria-label={platform} className="h-4 w-4 shrink-0" />
      {author && (
        <span className="max-w-[120px] truncate font-semibold text-ink">@{author}</span>
      )}
      {verified && (
        <BadgeCheck aria-label="Verified source" className="h-4 w-4 shrink-0 text-info" />
      )}
    </div>
  );
}
