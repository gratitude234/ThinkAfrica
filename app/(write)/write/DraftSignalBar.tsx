"use client";

import { useId, useMemo, useState } from "react";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { getDraftCoachingSummary } from "./draftCoaching";

interface DraftSignalBarProps {
  postType: PostType;
  title: string;
  excerpt: string;
  content: string;
  tags: string[];
  references: PostReferenceRecord[];
  wordCount: number;
  inResponseToTitle: string | null;
}

/**
 * A one-line readiness signal for the draft, expandable into the full
 * checklist.
 *
 * This replaces WriteReadinessPanel, the permanent desktop sidebar rail that
 * commit 3179626 removed when the composer moved to canvas mode. That removal
 * was right: a scoreboard pinned beside the page while you write is pressure,
 * not help, and it only ever existed on desktop. But it took the coaching with
 * it, leaving draftCoaching.ts orphaned and the composer with no guidance at
 * all between the blank page and the publish drawer.
 *
 * So: one quiet line, identical on phone and desktop, that names the single
 * next thing worth doing. It scrolls away with the page rather than pinning
 * itself, and the full list stays one tap behind a disclosure. Guidance when
 * you look for it, silence when you don't.
 */
export default function DraftSignalBar({
  postType,
  title,
  excerpt,
  content,
  tags,
  references,
  wordCount,
  inResponseToTitle,
}: DraftSignalBarProps) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();

  const summary = useMemo(
    () =>
      getDraftCoachingSummary({
        postType,
        title,
        excerpt,
        content,
        tags,
        references,
        wordCount,
        inResponseToTitle,
      }),
    [
      content,
      excerpt,
      inResponseToTitle,
      postType,
      references,
      tags,
      title,
      wordCount,
    ]
  );

  const { primaryAction, items, completedCount, totalCount } = summary;
  const allDone = completedCount === totalCount;

  // An untouched draft gets nothing: the placeholder in the editor is already
  // telling someone what to write, and a checklist of zeroes on a blank page
  // reads as a grading rubric.
  if (wordCount === 0 && title.trim().length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200/80 bg-white/70">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-gray-50/80"
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
            allDone
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-100 text-gray-500"
          }`}
          aria-hidden="true"
        >
          {allDone ? (
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            completedCount
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {allDone ? "This draft covers the essentials" : primaryAction.label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {allDone
              ? `${completedCount} of ${totalCount} · you can keep refining or publish`
              : primaryAction.helper}
          </span>
        </span>

        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 motion-reduce:transition-none ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {expanded ? (
        <div id={panelId} className="border-t border-gray-200/80 px-3.5 py-3">
          <p className="mb-2.5 text-xs text-ink-muted">{summary.formatHint}</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.key} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    item.done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100"
                  }`}
                  aria-hidden="true"
                >
                  {item.done ? (
                    <svg
                      className="h-2.5 w-2.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3.5}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] ${
                      item.done ? "text-ink-muted line-through" : "font-medium text-ink"
                    }`}
                  >
                    {item.label}
                  </span>
                  {!item.done ? (
                    <span className="mt-0.5 block text-xs text-ink-muted">
                      {item.helper}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="sr-only" aria-live="polite">
            {completedCount} of {totalCount} draft checks complete.
          </p>
        </div>
      ) : null}
    </div>
  );
}
