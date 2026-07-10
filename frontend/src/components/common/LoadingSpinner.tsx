/**
 * LoadingSpinner — legacy wrapper around the design-system Spinner.
 * Kept so existing imports keep working; prefer components/ui Spinner
 * or LoadingState in new code.
 */

import React from "react";
import { Spinner } from "../ui";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = "md", text }) => (
  <div className="flex flex-col items-center justify-center gap-2 p-4">
    <Spinner size={size} label={text ?? "Loading"} />
    {text && (
      <p aria-hidden="true" className="text-sm text-ink-muted">
        {text}
      </p>
    )}
  </div>
);

export default LoadingSpinner;
