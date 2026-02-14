/**
 * Source Badge - Shows platform icon and author
 */

import type { SourcePlatform } from '../../types/newsTypes';
import { SOURCE_PLATFORM_ICONS } from '../../types/newsTypes';

interface SourceBadgeProps {
  platform: SourcePlatform;
  author?: string;
  verified?: boolean;
}

export function SourceBadge({ platform, author, verified }: SourceBadgeProps) {
  const icon = SOURCE_PLATFORM_ICONS[platform];

  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-600">
      <span>{icon}</span>
      {author && (
        <span className="font-medium truncate max-w-[120px]">@{author}</span>
      )}
      {verified && (
        <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
        </svg>
      )}
    </div>
  );
}
