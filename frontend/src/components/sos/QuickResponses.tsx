/**
 * Quick response buttons for fast tapping
 */

import type { QuickOption } from "../../types/sosTypes";

interface QuickResponsesProps {
  options: QuickOption[];
  onSelect: (option: QuickOption) => void;
  disabled?: boolean;
}

export function QuickResponses({
  options,
  onSelect,
  disabled = false,
}: QuickResponsesProps) {
  if (options.length === 0) return null;

  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
        Quick responses
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option)}
            disabled={disabled}
            className={`min-h-12 rounded-full border-2 px-5 py-2.5 text-base font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
              disabled
                ? "cursor-not-allowed border-edge bg-surface text-ink-faint opacity-60"
                : "border-edge-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft active:bg-accent-soft"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
