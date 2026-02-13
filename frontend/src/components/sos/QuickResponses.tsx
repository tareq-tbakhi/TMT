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
      <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">
        Quick responses
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onSelect(option)}
            disabled={disabled}
            className={`px-5 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold transition-all ${
              disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 active:bg-blue-100 active:scale-95"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
