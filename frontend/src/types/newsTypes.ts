/**
 * News Tab TypeScript Types
 * For displaying AI-curated news from social media platforms
 */

// Source platforms for news articles
export type SourcePlatform = 'twitter' | 'telegram' | 'facebook' | 'instagram' | 'other';

// News categories
export type NewsCategory = 'threat' | 'update' | 'warning' | 'info';

// Severity levels
export type NewsSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * News Article - Main data structure
 */
export interface NewsArticle {
  id: string;

  // Content
  title: string;
  summary: string;
  content?: string;

  // Source information
  source_platform: SourcePlatform;
  source_url?: string;
  source_author?: string;

  // Location data
  latitude?: number;
  longitude?: number;
  location_name?: string;
  distance_km?: number; // Calculated from user's location

  // AI Scoring (0-100)
  trust_score: number;
  priority_score: number;
  relevance_tags: string[];

  // Categorization
  category: NewsCategory;
  severity: NewsSeverity;
  event_type?: string; // flood, fire, conflict, medical, etc.

  // Media attachments
  media_urls?: string[];

  // Engagement metrics
  engagement_count: number;
  verified: boolean;

  // Timestamps
  published_at: string;
  created_at: string;
}

/**
 * Filters for news list
 */
export interface NewsFilters {
  category?: NewsCategory | 'all';
  severity?: NewsSeverity;
  source_platform?: SourcePlatform;
  min_trust_score?: number;
  radius_km?: number;
  search?: string;
}

/**
 * News store state interface
 */
export interface NewsState {
  // Data
  articles: NewsArticle[];
  filteredArticles: NewsArticle[];
  selectedArticle: NewsArticle | null;

  // UI State
  loading: boolean;
  error: string | null;
  filters: NewsFilters;

  // Actions
  setArticles: (articles: NewsArticle[]) => void;
  addArticle: (article: NewsArticle) => void;
  removeArticle: (id: string) => void;
  setFilters: (filters: Partial<NewsFilters>) => void;
  setSelectedArticle: (article: NewsArticle | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  applyFilters: () => void;
  reset: () => void;
}

/**
 * Trust score tier for color coding
 */
export type TrustTier = 'high' | 'trusted' | 'moderate' | 'low' | 'unverified';

/**
 * Helper to get trust tier from score
 */
export function getTrustTier(score: number): TrustTier {
  if (score >= 80) return 'high';
  if (score >= 60) return 'trusted';
  if (score >= 40) return 'moderate';
  if (score >= 20) return 'low';
  return 'unverified';
}

/**
 * Trust tier styling
 */
export const TRUST_TIER_STYLES: Record<TrustTier, { bg: string; text: string; label: string }> = {
  high: { bg: 'bg-green-100', text: 'text-green-700', label: 'Highly Trusted' },
  trusted: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Trusted' },
  moderate: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Moderate' },
  low: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Low Trust' },
  unverified: { bg: 'bg-red-100', text: 'text-red-700', label: 'Unverified' },
};

/**
 * Severity styling
 */
export const SEVERITY_STYLES: Record<NewsSeverity, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-600', text: 'text-white' },
  high: { bg: 'bg-orange-500', text: 'text-white' },
  medium: { bg: 'bg-yellow-500', text: 'text-gray-900' },
  low: { bg: 'bg-blue-400', text: 'text-white' },
};

/**
 * Category icons and labels
 */
export const CATEGORY_CONFIG: Record<NewsCategory, { icon: string; label: string }> = {
  threat: { icon: '⚠️', label: 'Threat' },
  warning: { icon: '🚨', label: 'Warning' },
  update: { icon: '📢', label: 'Update' },
  info: { icon: 'ℹ️', label: 'Info' },
};

/**
 * Source platform icons
 */
export const SOURCE_PLATFORM_ICONS: Record<SourcePlatform, string> = {
  twitter: '🐦',
  telegram: '✈️',
  facebook: '📘',
  instagram: '📷',
  other: '🌐',
};
