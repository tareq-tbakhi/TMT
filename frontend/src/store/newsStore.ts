/**
 * News Store - Zustand state management for News Tab
 * Fetches from backend API, uses dummy data as fallback or when VITE_USE_DUMMY_DATA=true
 */

import { create } from 'zustand';
import type { NewsArticle, NewsFilters, NewsState } from '../types/newsTypes';
import type { SourcePlatform } from '../types/newsTypes';
import { getNews, type NewsArticleAPI } from '../services/api';
import { DUMMY_NEWS } from '../data/dummyNewsData';
import { isDummyMode } from '../hooks/useDataMode';

const initialFilters: NewsFilters = {
  category: 'all',
  min_trust_score: 0,
  radius_km: 50,
  search: '',
};

export const useNewsStore = create<NewsState>((set, get) => ({
  // Initial state
  articles: [],
  filteredArticles: [],
  selectedArticle: null,
  loading: false,
  error: null,
  filters: initialFilters,

  // Set all articles
  setArticles: (articles: NewsArticle[]) => {
    set({ articles });
    get().applyFilters();
  },

  // Add a new article (for real-time updates)
  addArticle: (article: NewsArticle) => {
    set((state) => ({
      articles: [article, ...state.articles],
    }));
    get().applyFilters();
  },

  // Remove an article
  removeArticle: (id: string) => {
    set((state) => ({
      articles: state.articles.filter((a) => a.id !== id),
    }));
    get().applyFilters();
  },

  // Update filters
  setFilters: (newFilters: Partial<NewsFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
    get().applyFilters();
  },

  // Set selected article for detail view
  setSelectedArticle: (article: NewsArticle | null) => {
    set({ selectedArticle: article });
  },

  // Set loading state
  setLoading: (loading: boolean) => {
    set({ loading });
  },

  // Set error state
  setError: (error: string | null) => {
    set({ error });
  },

  // Apply filters to articles
  applyFilters: () => {
    const { articles, filters } = get();
    let filtered = [...articles];

    // Filter by category
    if (filters.category && filters.category !== 'all') {
      filtered = filtered.filter((a) => a.category === filters.category);
    }

    // Filter by severity
    if (filters.severity) {
      filtered = filtered.filter((a) => a.severity === filters.severity);
    }

    // Filter by source platform
    if (filters.source_platform) {
      filtered = filtered.filter((a) => a.source_platform === filters.source_platform);
    }

    // Filter by minimum trust score
    if (filters.min_trust_score && filters.min_trust_score > 0) {
      filtered = filtered.filter((a) => a.trust_score >= filters.min_trust_score!);
    }

    // Filter by radius (distance)
    if (filters.radius_km) {
      filtered = filtered.filter(
        (a) => a.distance_km === undefined || a.distance_km <= filters.radius_km!
      );
    }

    // Filter by search query
    if (filters.search && filters.search.trim() !== '') {
      const query = filters.search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.summary.toLowerCase().includes(query) ||
          a.relevance_tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort by priority score (highest first), then by recency
    filtered.sort((a, b) => {
      // First by priority
      if (b.priority_score !== a.priority_score) {
        return b.priority_score - a.priority_score;
      }
      // Then by recency
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

    set({ filteredArticles: filtered });
  },

  // Reset store to initial state
  reset: () => {
    set({
      articles: [],
      filteredArticles: [],
      selectedArticle: null,
      loading: false,
      error: null,
      filters: initialFilters,
    });
  },
}));

/** Map backend NewsArticleAPI to frontend NewsArticle type. */
function mapApiArticle(a: NewsArticleAPI): NewsArticle {
  const validPlatforms: SourcePlatform[] = ['twitter', 'telegram', 'facebook', 'instagram', 'other'];
  const platform: SourcePlatform = validPlatforms.includes(a.source_platform as SourcePlatform)
    ? (a.source_platform as SourcePlatform)
    : 'other';

  return {
    id: a.id,
    title: a.title,
    summary: a.summary,
    content: a.content ?? undefined,
    source_platform: platform,
    source_url: a.source_url ?? undefined,
    source_author: a.source_author ?? undefined,
    latitude: a.latitude ?? undefined,
    longitude: a.longitude ?? undefined,
    location_name: a.location_name ?? undefined,
    distance_km: a.distance_km ?? undefined,
    trust_score: a.trust_score,
    priority_score: a.priority_score,
    relevance_tags: a.relevance_tags,
    category: a.category as NewsArticle['category'],
    severity: a.severity as NewsArticle['severity'],
    event_type: a.event_type ?? undefined,
    media_urls: a.media_urls,
    engagement_count: a.engagement_count,
    verified: a.verified,
    published_at: a.published_at,
    created_at: a.created_at,
  };
}

/**
 * Fetch news from the backend API.
 * Uses dummy data when VITE_USE_DUMMY_DATA=true, otherwise calls real API.
 * Falls back to dummy data if the API call fails.
 */
export async function fetchNewsFromAPI(params?: {
  category?: string;
  severity?: string;
  hours?: number;
}) {
  const store = useNewsStore.getState();
  store.setLoading(true);
  store.setError(null);

  if (isDummyMode()) {
    // Use dummy data with simulated delay
    setTimeout(() => {
      store.setArticles(DUMMY_NEWS);
      store.setLoading(false);
    }, 500);
    return;
  }

  try {
    const { articles } = await getNews({
      category: params?.category,
      severity: params?.severity,
      hours: params?.hours ?? 48,
      limit: 100,
    });
    const mapped = articles.map(mapApiArticle);
    store.setArticles(mapped.length > 0 ? mapped : DUMMY_NEWS);
  } catch (err) {
    console.warn('News API unavailable, using dummy data:', err);
    store.setArticles(DUMMY_NEWS);
  } finally {
    store.setLoading(false);
  }
}

/**
 * @deprecated Use fetchNewsFromAPI() instead
 */
export function initializeNewsWithDummyData() {
  fetchNewsFromAPI();
}

/**
 * @deprecated Use fetchNewsFromAPI() instead
 */
export function initializeNews() {
  fetchNewsFromAPI();
}

// Export data mode helper
export const isUsingDummyData = isDummyMode;
