/**
 * Button — the single button component for the whole app.
 *
 * Accessibility: minimum 44px touch target (48px+ for lg/xl), visible
 * focus ring, loading state announced to screen readers, disabled
 * handled via aria-disabled so focus is not lost.
 */

import React from "react";
import { Loader2 } from "lucide-react";

type Variant =
  | "primary" // main action (role accent)
  | "secondary" // outlined, on surface
  | "ghost" // borderless, low emphasis
  | "danger" // destructive
  | "success" // confirming / completing
  | "sos"; // reserved for emergency actions ONLY

type Size = "sm" | "md" | "lg" | "xl";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Icon rendered before the label. Pass a lucide icon element. */
  icon?: React.ReactNode;
  /** Icon rendered after the label. */
  iconEnd?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent hover:bg-accent-hover shadow-1 border border-transparent",
  secondary:
    "bg-surface text-ink border border-edge-strong hover:bg-surface-2",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-2 hover:text-ink border border-transparent",
  danger:
    "bg-danger text-white hover:bg-danger-hover shadow-1 border border-transparent",
  success:
    "bg-success text-white hover:opacity-90 shadow-1 border border-transparent",
  sos: "bg-sos text-on-sos hover:bg-sos-hover shadow-2 border border-transparent",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5 rounded-md",
  md: "min-h-11 px-4 text-base gap-2 rounded-md",
  lg: "min-h-12 px-5 text-lg gap-2.5 rounded-lg",
  xl: "min-h-14 px-6 text-xl gap-3 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      iconEnd,
      fullWidth = false,
      className = "",
      children,
      disabled,
      onClick,
      type = "button",
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        aria-disabled={isDisabled || undefined}
        aria-busy={loading || undefined}
        onClick={isDisabled ? (e) => e.preventDefault() : onClick}
        className={[
          "inline-flex items-center justify-center font-semibold select-none",
          "transition-colors duration-150",
          "focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth ? "w-full" : "",
          isDisabled ? "opacity-55 cursor-not-allowed" : "cursor-pointer",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {loading ? (
          <Loader2 aria-hidden="true" className="h-[1.2em] w-[1.2em] animate-spin" />
        ) : (
          icon && (
            <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-[1.2em] [&>svg]:w-[1.2em]">
              {icon}
            </span>
          )
        )}
        {children && <span>{children}</span>}
        {iconEnd && !loading && (
          <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-[1.2em] [&>svg]:w-[1.2em]">
            {iconEnd}
          </span>
        )}
        {loading && <span className="sr-only">Loading</span>}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
