/**
 * News List - Scrollable list of news cards
 */

import type { NewsArticle } from '../../types/newsTypes';
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gray-200 rounded" />
          <div className="w-20 h-4 bg-gray-200 rounded" />
        </div>
        <div className="w-10 h-6 bg-gray-200 rounded-full" />
      </div>
      <div className="w-full h-5 bg-gray-200 rounded mb-2" />
      <div className="w-3/4 h-5 bg-gray-200 rounded mb-3" />
      <div className="w-full h-4 bg-gray-200 rounded mb-1" />
      <div className="w-2/3 h-4 bg-gray-200 rounded mb-3" />
      <div className="flex gap-2 mb-3">
        <div className="w-16 h-6 bg-gray-200 rounded-full" />
        <div className="w-14 h-6 bg-gray-200 rounded-full" />
      </div>
      <div className="flex justify-between">
        <div className="w-16 h-3 bg-gray-200 rounded" />
        <div className="w-12 h-3 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

/**
 * Empty state when no news found
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">No news in your area</h3>
      <p className="text-sm text-gray-500 max-w-xs">
        There are no recent news items matching your filters. Try adjusting your search or check back later.
      </p>
    </div>
  );
}

export function NewsList({ articles, loading, onArticlePress }: NewsListProps) {
  // Show loading skeletons
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <NewsCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Show empty state
  if (articles.length === 0) {
    return <EmptyState />;
  }

  // Show news list
  return (
    <div className="space-y-3">
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
