/**
 * News Filters - Category filter pills (matching Alerts screen style)
 */

import type { NewsCategory, NewsFilters as NewsFiltersType } from '../../types/newsTypes';

interface NewsFiltersProps {
  filters: NewsFiltersType;
  onFilterChange: (filters: Partial<NewsFiltersType>) => void;
  resultCount: number;
  counts: {
    all: number;
    threat: number;
    warning: number;
    update: number;
    info: number;
  };
}

type FilterTab = 'all' | NewsCategory;

const FILTER_TABS: FilterTab[] = ['all', 'threat', 'warning', 'update', 'info'];

// Colors matching the Alerts screen style
const tabColors: Record<FilterTab, string> = {
  all: 'bg-gray-100 text-gray-700',
  threat: 'bg-red-100 text-red-700',
  warning: 'bg-orange-100 text-orange-700',
  update: 'bg-blue-100 text-blue-700',
  info: 'bg-green-100 text-green-700',
};

const activeColors: Record<FilterTab, string> = {
  all: 'bg-gray-800 text-white',
  threat: 'bg-red-600 text-white',
  warning: 'bg-orange-500 text-white',
  update: 'bg-blue-500 text-white',
  info: 'bg-green-500 text-white',
};

const tabLabels: Record<FilterTab, string> = {
  all: 'All',
  threat: 'Threats',
  warning: 'Warnings',
  update: 'Updates',
  info: 'Info',
};

export function NewsFilters({ filters, onFilterChange, counts }: NewsFiltersProps) {
  const currentFilter = (filters.category || 'all') as FilterTab;

  const handleCategoryChange = (category: FilterTab) => {
    onFilterChange({ category: category === 'all' ? 'all' : category });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_TABS.map((tab) => {
        const isActive = currentFilter === tab;
        const count = counts[tab];

        return (
          <button
            key={tab}
            onClick={() => handleCategoryChange(tab)}
            className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition ${
              isActive ? activeColors[tab] : tabColors[tab]
            }`}
          >
            {tabLabels[tab]} ({count})
          </button>
        );
      })}
    </div>
  );
}
