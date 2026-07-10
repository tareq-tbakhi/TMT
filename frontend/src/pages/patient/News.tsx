/**
 * News Page - Patient view for AI-curated news
 */

import { useEffect, useMemo } from 'react';
import { Newspaper } from 'lucide-react';
import { useNewsStore, fetchNewsFromAPI } from '../../store/newsStore';
import { NewsFilters, NewsList, NewsDetail } from '../../components/news';

export default function News() {
  const {
    articles,
    filteredArticles,
    selectedArticle,
    loading,
    filters,
    setFilters,
    setSelectedArticle,
  } = useNewsStore();

  // Fetch news from API on mount (falls back to dummy data)
  useEffect(() => {
    fetchNewsFromAPI();
  }, []);

  // Compute category counts from all articles (unfiltered)
  const counts = useMemo(() => ({
    all: articles.length,
    threat: articles.filter((a) => a.category === 'threat').length,
    warning: articles.filter((a) => a.category === 'warning').length,
    update: articles.filter((a) => a.category === 'update').length,
    info: articles.filter((a) => a.category === 'info').length,
  }), [articles]);

  return (
    <div className="min-h-full">
      {/* Header */}
      <header className="border-b border-edge bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-on-accent-soft"
          >
            <Newspaper className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight text-ink">Nearby News</h2>
            <p className="text-sm text-ink-muted">AI-curated updates in your area</p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-edge bg-surface px-4 py-3">
        <div className="mx-auto max-w-lg">
          <NewsFilters
            filters={filters}
            onFilterChange={setFilters}
            resultCount={filteredArticles.length}
            counts={counts}
          />
        </div>
      </div>

      {/* News List */}
      <div className="mx-auto max-w-lg px-4 py-4">
        <NewsList
          articles={filteredArticles}
          loading={loading}
          onArticlePress={setSelectedArticle}
        />
      </div>

      {/* Detail Modal */}
      {selectedArticle && (
        <NewsDetail
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  );
}
