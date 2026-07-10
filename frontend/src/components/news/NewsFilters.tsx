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

// Resting (soft) chip styles per category — token colors only
const tabColors: Record<FilterTab, string> = {
  all: 'border-edge bg-surface-2 text-ink-muted hover:bg-surface-3 hover:text-ink',
  threat: 'border-transparent bg-danger-soft text-on-danger-soft hover:opacity-85',
  warning: 'border-transparent bg-sev-high-soft text-on-sev-high-soft hover:opacity-85',
  update: 'border-transparent bg-info-soft text-on-info-soft hover:opacity-85',
  info: 'border-transparent bg-success-soft text-on-success-soft hover:opacity-85',
};

// Selected (solid) chip styles per category
const activeColors: Record<FilterTab, string> = {
  all: 'border-transparent bg-accent text-on-accent',
  threat: 'border-transparent bg-danger text-white',
  warning: 'border-transparent bg-sev-high text-white',
  update: 'border-transparent bg-info text-white',
  info: 'border-transparent bg-success text-white',
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
    <div role="group" aria-label="Filter news by category" className="flex flex-wrap gap-2">
      {FILTER_TABS.map((tab) => {
        const isActive = currentFilter === tab;
        const count = counts[tab];

        return (
          <button
            key={tab}
            type="button"
            onClick={() => handleCategoryChange(tab)}
            aria-pressed={isActive}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold capitalize transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
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
