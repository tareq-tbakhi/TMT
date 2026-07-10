/**
 * Card — standard surface container.
 * Use `interactive` for clickable cards (adds hover/focus affordances).
 */

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds hover & focus styles; combine with role="button"/Link wrappers. */
  interactive?: boolean;
  /** Removes default padding (e.g. for list cards with their own rows). */
  flush?: boolean;
  as?: React.ElementType;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    { interactive = false, flush = false, as: Tag = "div", className = "", children, ...rest },
    ref
  ) => (
    <Tag
      ref={ref}
      className={[
        "rounded-lg border border-edge bg-surface shadow-1",
        flush ? "" : "p-4 sm:p-5",
        interactive
          ? "transition-shadow duration-150 hover:shadow-2 hover:border-edge-strong focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 cursor-pointer"
          : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Tag>
  )
);

Card.displayName = "Card";

export interface CardHeaderProps {
  title: React.ReactNode;
  /** Optional supporting text under the title. */
  description?: React.ReactNode;
  /** Slot on the end side (buttons, badges…). */
  actions?: React.ReactNode;
  /** Optional lucide icon element shown before the title. */
  icon?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  description,
  actions,
  icon,
  className = "",
}) => (
  <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
    <div className="flex min-w-0 items-start gap-3">
      {icon && (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft [&>svg]:h-5 [&>svg]:w-5"
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        )}
      </div>
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);

export default Card;
