/**
 * News Page - Patient view for AI-curated news
 */

import { useEffect, useMemo } from 'react';
import { useNewsStore, initializeNewsWithDummyData } from '../../store/newsStore';
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

  // Initialize with dummy data on mount
  useEffect(() => {
    initializeNewsWithDummyData();
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
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Nearby News</h1>
            <p className="text-sm text-gray-500">AI-curated updates in your area</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <NewsFilters
          filters={filters}
          onFilterChange={setFilters}
          resultCount={filteredArticles.length}
          counts={counts}
        />
      </div>

      {/* News List */}
      <div className="px-4 py-4">
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
