"use client";

import { useId } from "react";
import type { ReactNode } from "react";

/**
 * Field primitives for the Command Center.
 *
 * Every one wires its own label, help text and error together, so a section
 * cannot accidentally ship an input whose error is visible but unannounced.
 */
export const FIELD_INPUT =
  "field-focus min-h-11 w-full rounded-xl border border-card-border bg-canvas px-4 py-3 text-sm text-ink transition-[border-color,box-shadow] placeholder:text-ink-muted disabled:cursor-not-allowed disabled:opacity-60";

export function Field({
  label,
  help,
  error,
  optional,
  children,
}: {
  label: string;
  help?: ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [errorId, helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink-soft">
        {label}
        {optional ? (
          <span className="ml-1 text-xs font-normal text-ink-muted">(optional)</span>
        ) : null}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <p id={errorId ?? undefined} role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={helpId ?? undefined} className="mt-1 text-xs leading-5 text-ink-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function CharacterCount({
  value,
  max,
}: {
  value: string;
  max: number;
}) {
  const over = value.length > max;
  return (
    <span
      aria-label={`${value.length} of ${max} characters used`}
      className={`text-xs ${over ? "font-semibold text-red-600" : "text-ink-muted"}`}
    >
      {value.length}/{max}
    </span>
  );
}

export function ChipToggle({
  label,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={`focus-ring min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-emerald-brand bg-emerald-brand font-semibold text-white"
          : "border-card-border bg-card text-ink-soft hover:border-emerald-brand/40 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-card-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`focus-ring relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-emerald-brand" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
