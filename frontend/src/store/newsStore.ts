/**
 * News Store - Zustand state management for News Tab
 */

import { create } from 'zustand';
import type { NewsArticle, NewsFilters, NewsState } from '../types/newsTypes';
import { DUMMY_NEWS } from '../data/dummyNewsData';

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

/**
 * Initialize store with dummy data (for development)
 * Call this when the News page mounts
 */
export function initializeNewsWithDummyData() {
  const store = useNewsStore.getState();
  store.setLoading(true);

  // Simulate API delay
  setTimeout(() => {
    store.setArticles(DUMMY_NEWS);
    store.setLoading(false);
  }, 500);
}
