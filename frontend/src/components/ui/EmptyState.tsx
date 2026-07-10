/**
 * EmptyState — friendly placeholder for empty lists / no-data states.
 */

import React from "react";

export interface EmptyStateProps {
  /** Lucide icon element. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Call-to-action slot (Button). */
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-edge-strong bg-surface px-6 py-12 text-center ${className}`}
  >
    {icon && (
      <span
        aria-hidden="true"
        className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-faint [&>svg]:h-7 [&>svg]:w-7"
      >
        {icon}
      </span>
    )}
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    {description && (
      <p className="mt-1 max-w-sm text-base text-ink-muted">{description}</p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
