/**
 * EquipmentChecklist - Shows required equipment with checkboxes
 * Used by Civil Defense and Firefighter views
 */

import { useState } from "react";

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
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-purple-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="font-bold text-purple-800">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-purple-600 font-medium">
            {checked.size}/{equipment.length}
          </span>
          {allChecked && (
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
              Ready
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-100">
        <div
          className={`h-full transition-all duration-300 ${allChecked ? "bg-green-500" : "bg-purple-500"}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Equipment List */}
      <div className="p-2">
        {equipment.map((item, index) => (
          <button
            key={index}
            onClick={() => toggleItem(index)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
              checked.has(index)
                ? "bg-green-50"
                : "hover:bg-gray-50 active:bg-gray-100"
            }`}
          >
            {/* Checkbox */}
            <div
              className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                checked.has(index)
                  ? "bg-green-500 border-green-500"
                  : "border-gray-300"
              }`}
            >
              {checked.has(index) && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>

            {/* Item Text */}
            <span
              className={`text-base ${
                checked.has(index)
                  ? "text-green-700 line-through"
                  : "text-gray-700"
              }`}
            >
              {item}
            </span>
          </button>
        ))}
      </div>

      {/* All Ready Banner */}
      {allChecked && (
        <div className="bg-green-500 text-white px-4 py-3 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-bold">All Equipment Ready</span>
        </div>
      )}
    </div>
  );
}
