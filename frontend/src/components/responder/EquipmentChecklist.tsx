/**
 * EquipmentChecklist - Shows required equipment with large check rows
 * Used by Civil Defense and Firefighter views.
 * Checked state = icon + strikethrough + color (never color alone),
 * rows are >=56px buttons with aria-pressed, progress exposed as a
 * progressbar for screen readers.
 */

import { useState } from "react";
import { Check, CircleCheck, ListChecks } from "lucide-react";
import { Badge } from "../ui";

interface EquipmentChecklistProps {
  equipment: string[];
  title?: string;
}

export default function EquipmentChecklist({
  equipment,
  title = "Required Equipment",
}: EquipmentChecklistProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggleItem = (index: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allChecked = checked.size === equipment.length;
  const progress = equipment.length > 0 ? Math.round((checked.size / equipment.length) * 100) : 0;

  if (!equipment || equipment.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface shadow-1">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 bg-accent-soft px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface text-on-accent-soft"
          >
            <ListChecks className="h-5 w-5" />
          </span>
          <span className="truncate text-base font-bold text-on-accent-soft">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold text-on-accent-soft">
            {checked.size}/{equipment.length}
          </span>
          {allChecked && (
            <Badge tone="success" solid size="sm" icon={<Check />}>
              Ready
            </Badge>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div
        role="progressbar"
        aria-label="Equipment readiness"
        aria-valuemin={0}
        aria-valuemax={equipment.length}
        aria-valuenow={checked.size}
        className="h-1.5 bg-surface-3"
      >
        <div
          className={`h-full transition-all duration-300 ${allChecked ? "bg-success" : "bg-accent"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Equipment List */}
      <ul className="p-2">
        {equipment.map((item, index) => {
          const isChecked = checked.has(index);
          return (
            <li key={index}>
              {/* NOTE: bg-green-50 on the checked row (plus line-through on the
                  text span) is pinned by EquipmentChecklist.test.tsx via
                  toHaveClass — keep hardcoded. The row stays light in every
                  theme, so the fixed dark green text keeps AA contrast. */}
              <button
                type="button"
                onClick={() => toggleItem(index)}
                aria-pressed={isChecked}
                className={`flex min-h-14 w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                  isChecked ? "bg-green-50" : "hover:bg-surface-2 active:bg-surface-3"
                }`}
              >
                {/* Checkbox */}
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    isChecked ? "border-green-600 bg-green-600" : "border-edge-strong bg-surface"
                  }`}
                >
                  {isChecked && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </span>

                {/* Item Text */}
                <span
                  className={`text-base font-semibold ${
                    isChecked ? "text-green-800 line-through" : "text-ink"
                  }`}
                >
                  {item}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* All Ready Banner */}
      {allChecked && (
        <div className="flex items-center justify-center gap-2 bg-success px-4 py-3 text-white">
          <CircleCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="text-base font-bold">All Equipment Ready</span>
        </div>
      )}
    </div>
  );
}
