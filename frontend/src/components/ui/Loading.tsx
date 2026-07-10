/**
 * Loading primitives — Spinner (announced to screen readers) and
 * Skeleton blocks for content placeholders.
 */

import React from "react";
import { Loader2 } from "lucide-react";

export interface SpinnerProps {
  /** Accessible label, e.g. "Loading alerts". */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SPINNER_SIZES = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };

export const Spinner: React.FC<SpinnerProps> = ({
  label = "Loading",
  size = "md",
  className = "",
}) => (
  <span role="status" className={`inline-flex items-center gap-2 ${className}`}>
    <Loader2
      aria-hidden="true"
      className={`animate-spin text-accent ${SPINNER_SIZES[size]}`}
    />
    <span className="sr-only">{label}</span>
  </span>
);

/** Full-area centered loading state for page bodies. */
export const LoadingState: React.FC<{ label?: string }> = ({ label }) => (
  <div className="flex min-h-48 items-center justify-center">
    <Spinner size="lg" label={label} />
  </div>
);

export interface SkeletonProps {
  className?: string;
}

/** Shimmering placeholder block. Size it with width/height classes. */
export const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => (
  <div aria-hidden="true" className={`loading-skeleton rounded-md ${className}`} />
);

export default Spinner;
