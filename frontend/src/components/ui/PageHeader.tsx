/**
 * PageHeader — consistent page title block used at the top of every page.
 */

import React from "react";

export interface PageHeaderProps {
  title: React.ReactNode;
  /** Supporting line under the title. */
  description?: React.ReactNode;
  /** Slot for actions (Buttons, filters…). */
  actions?: React.ReactNode;
  /** Optional lucide icon element. */
  icon?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  icon,
  className = "",
}) => (
  <header
    className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}
  >
    <div className="flex min-w-0 items-center gap-3">
      {icon && (
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-on-accent-soft [&>svg]:h-6 [&>svg]:w-6"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && (
          <p className="mt-1 text-base text-ink-muted">{description}</p>
        )}
      </div>
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    )}
  </header>
);

export default PageHeader;
