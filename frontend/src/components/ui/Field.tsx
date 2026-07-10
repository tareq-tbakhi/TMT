/**
 * Form fields — Input, Select, Textarea with built-in label, hint and
 * error wiring (aria-describedby / aria-invalid handled for you).
 *
 * Always pass a `label`. If it must be visually hidden, use hideLabel —
 * screen reader users still get it.
 */

import React, { useId } from "react";
import { AlertCircle } from "lucide-react";

interface BaseFieldProps {
  label: React.ReactNode;
  hideLabel?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
}

const FIELD_CLASSES =
  "w-full min-h-11 rounded-md border bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-1 disabled:opacity-55 disabled:cursor-not-allowed";

const useFieldWiring = (props: BaseFieldProps) => {
  const id = useId();
  const hintId = props.hint ? `${id}-hint` : undefined;
  const errorId = props.error ? `${id}-error` : undefined;
  const describedBy =
    [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return { id, hintId, errorId, describedBy };
};

const FieldShell: React.FC<
  BaseFieldProps & {
    id: string;
    hintId?: string;
    errorId?: string;
    children: React.ReactNode;
  }
> = ({ label, hideLabel, hint, error, required, className = "", id, hintId, errorId, children }) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label
      htmlFor={id}
      className={hideLabel ? "sr-only" : "text-sm font-semibold text-ink"}
    >
      {label}
      {required && (
        <span aria-hidden="true" className="ms-0.5 text-danger">
          *
        </span>
      )}
    </label>
    {hint && (
      <p id={hintId} className="text-sm text-ink-muted -mt-0.5">
        {hint}
      </p>
    )}
    {children}
    {error && (
      <p
        id={errorId}
        className="flex items-center gap-1.5 text-sm font-medium text-danger"
      >
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        {error}
      </p>
    )}
  </div>
);

/* ── Input ────────────────────────────────────────────────── */

export interface InputProps
  extends BaseFieldProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "required"> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, hideLabel, hint, error, required, className, ...rest }, ref) => {
    const { id, hintId, errorId, describedBy } = useFieldWiring({
      label,
      hint,
      error,
    });
    return (
      <FieldShell
        {...{ label, hideLabel, hint, error, required, className, id, hintId, errorId }}
      >
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${FIELD_CLASSES} ${error ? "border-danger" : "border-edge-strong"}`}
          {...rest}
        />
      </FieldShell>
    );
  }
);
Input.displayName = "Input";

/* ── Select ───────────────────────────────────────────────── */

export interface SelectProps
  extends BaseFieldProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className" | "required"> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hideLabel, hint, error, required, className, children, ...rest }, ref) => {
    const { id, hintId, errorId, describedBy } = useFieldWiring({
      label,
      hint,
      error,
    });
    return (
      <FieldShell
        {...{ label, hideLabel, hint, error, required, className, id, hintId, errorId }}
      >
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${FIELD_CLASSES} ${error ? "border-danger" : "border-edge-strong"}`}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  }
);
Select.displayName = "Select";

/* ── Textarea ─────────────────────────────────────────────── */

export interface TextareaProps
  extends BaseFieldProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "required"> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hideLabel, hint, error, required, className, rows = 4, ...rest }, ref) => {
    const { id, hintId, errorId, describedBy } = useFieldWiring({
      label,
      hint,
      error,
    });
    return (
      <FieldShell
        {...{ label, hideLabel, hint, error, required, className, id, hintId, errorId }}
      >
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${FIELD_CLASSES} ${error ? "border-danger" : "border-edge-strong"}`}
          {...rest}
        />
      </FieldShell>
    );
  }
);
Textarea.displayName = "Textarea";
