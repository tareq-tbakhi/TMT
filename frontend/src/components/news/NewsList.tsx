/**
 * News List - Scrollable list of news cards
 */

import { Newspaper } from 'lucide-react';
import type { NewsArticle } from '../../types/newsTypes';
import { Card, EmptyState, Skeleton } from '../ui';
import { NewsCard } from './NewsCard';

interface NewsListProps {
  articles: NewsArticle[];
  loading: boolean;
  onArticlePress: (article: NewsArticle) => void;
}

/**
 * Loading skeleton for news cards
 */
function NewsCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-5 w-full" />
      <Skeleton className="mb-3 h-5 w-3/4" />
      <Skeleton className="mb-1 h-4 w-full" />
      <Skeleton className="mb-3 h-4 w-2/3" />
      <div className="mb-3 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-12" />
      </div>
    </Card>
  );
}

export function NewsList({ articles, loading, onArticlePress }: NewsListProps) {
  // Show loading skeletons
  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading news">
        {[1, 2, 3].map((i) => (
          <NewsCardSkeleton key={i} />
        ))}
        <span className="sr-only">Loading news</span>
      </div>
    );
  }

  // Show empty state
  if (articles.length === 0) {
    return (
      <EmptyState
        icon={<Newspaper />}
        title="No news in your area"
        description="There are no recent news items matching your filters. Try adjusting your search or check back later."
      />
    );
  }

  // Show news list
  return (
    <div className="flex flex-col gap-3">
      {articles.map((article) => (
        <NewsCard
          key={article.id}
          article={article}
          onPress={onArticlePress}
        />
      ))}
    </div>
  );
}
