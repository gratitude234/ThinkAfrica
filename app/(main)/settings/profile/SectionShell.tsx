"use client";

import type { ReactNode } from "react";
import {
  PROFILE_SECTION_DEFINITIONS,
  type ProfileSectionKey,
} from "@/lib/profileCommandCenter";
import type { SectionStatus } from "./useSectionSave";

/**
 * One section of the Command Center: a heading, its fields, and its own save.
 *
 * Section-level saves rather than one page-level button, because the page
 * spans nine unrelated concerns across three tables. A single Save would make
 * an author who only wanted to fix a typo in their bio re-submit their
 * opportunity visibility too, and would make one failure ambiguous about what
 * did and did not persist.
 */
export function SaveStateMessage({
  status,
  error,
  id,
}: {
  status: SectionStatus;
  error: string | null;
  id: string;
}) {
  const message =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved."
        : status === "error"
          ? error
          : status === "dirty"
            ? "Unsaved changes."
            : null;

  return (
    <p
      id={id}
      // Announced rather than only shown. `role="alert"` for a failure so it
      // interrupts; polite for the ordinary states so a screen reader is not
      // interrupted mid-sentence while typing.
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
      className={`text-xs font-medium ${
        status === "error"
          ? "text-red-600"
          : status === "saved"
            ? "text-emerald-ink"
            : "text-ink-muted"
      }`}
    >
      {message}
    </p>
  );
}

export default function SectionShell({
  section,
  children,
  onSave,
  status,
  error,
  saveLabel = "Save",
  canSave = true,
  footnote,
}: {
  section: ProfileSectionKey;
  children: ReactNode;
  onSave?: () => void;
  status: SectionStatus;
  error: string | null;
  saveLabel?: string;
  canSave?: boolean;
  footnote?: ReactNode;
}) {
  const definition = PROFILE_SECTION_DEFINITIONS[section];
  const messageId = `${section}-save-state`;

  return (
    <section
      id={section}
      aria-labelledby={`${section}-heading`}
      className="scroll-mt-24 rounded-xl border border-card-border bg-card p-5 sm:p-6"
    >
      <div className="border-b border-card-border pb-4">
        <h2
          id={`${section}-heading`}
          className="font-display text-xl font-semibold text-ink"
        >
          {definition.label}
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">{definition.summary}</p>
      </div>

      <div className="mt-5 space-y-5">{children}</div>

      {onSave ? (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-card-border pt-4">
          {footnote ? (
            <p className="mr-auto max-w-md text-xs leading-5 text-ink-muted">
              {footnote}
            </p>
          ) : null}
          <SaveStateMessage status={status} error={error} id={messageId} />
          <button
            type="button"
            onClick={onSave}
            disabled={status === "saving" || !canSave}
            aria-busy={status === "saving" || undefined}
            aria-describedby={messageId}
            className="focus-ring inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "saving" ? "Saving…" : saveLabel}
          </button>
        </div>
      ) : footnote ? (
        <p className="mt-6 border-t border-card-border pt-4 text-xs leading-5 text-ink-muted">
          {footnote}
        </p>
      ) : null}
    </section>
  );
}
