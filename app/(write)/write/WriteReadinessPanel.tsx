"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { WRITE_FORMATS } from "./writeConfig";
import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";
import DraftSignalPreview from "./DraftSignalPreview";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getDraftCoachingSummary } from "./draftCoaching";

interface WriteReadinessPanelProps {
  postType: PostType;
  title: string;
  subtitle: string;
  content: string;
  excerpt: string;
  tags: string[];
  references: PostReferenceRecord[];
  coAuthors: CoAuthorProfile[];
  profileInfo: {
    full_name: string | null;
    username: string | null;
    university: string | null;
  } | null;
  inResponseToTitle: string | null;
  saveStatusText: string;
  wordCount: number;
  estimatedReadTime: number;
  wordProgress: number;
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function CheckIcon({ done }: { done: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
      }`}
      aria-hidden="true"
    >
      {done ? (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </span>
  );
}

export default function WriteReadinessPanel({
  postType,
  title,
  subtitle,
  content,
  excerpt,
  tags,
  references,
  coAuthors,
  profileInfo,
  inResponseToTitle,
  saveStatusText,
  wordCount,
  estimatedReadTime,
  wordProgress,
}: WriteReadinessPanelProps) {
  const completedTrackedRef = useRef<Set<string>>(new Set());
  const selectedFormat =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
  const coachingSummary = useMemo(
    () =>
      getDraftCoachingSummary({
        postType,
        title,
        subtitle,
        excerpt,
        content,
        tags,
        references,
        wordCount,
        inResponseToTitle,
      }),
    [content, excerpt, inResponseToTitle, postType, references, subtitle, tags, title, wordCount]
  );

  const needsReferences = postType === "research" || postType === "policy_brief";
  const bodyStarted = stripHtml(content).length > 0;
  const hasStarted = title.trim().length > 0 || bodyStarted;

  const coachingItem = (key: string) =>
    coachingSummary.items.find((i) => i.key === key);

  const guideChecklist = [
    {
      key: "title",
      label: "Title added",
      helper: title.trim()
        ? title.trim().slice(0, 60)
        : "Give readers a clear signal.",
      done: title.trim().length > 0,
    },
    {
      key: "body",
      label: "Body started",
      helper: bodyStarted
        ? `${wordCount.toLocaleString()} words drafted`
        : "Add a claim, why it matters, and one example.",
      done: bodyStarted,
    },
    {
      key: "why_it_matters",
      label: "Why it matters",
      helper:
        coachingItem("why_it_matters")?.helper ??
        "Connect the idea to campus, community, country, or Africa more broadly.",
      done: coachingItem("why_it_matters")?.done ?? false,
    },
    {
      key: "evidence_example",
      label: "Evidence or example",
      helper:
        coachingItem("evidence_example")?.helper ??
        "Add a source, case, statistic, or lived observation.",
      done: coachingItem("evidence_example")?.done ?? false,
    },
    {
      key: "reader_question",
      label: "Reader question",
      helper:
        coachingItem("reader_question")?.helper ??
        "End with a question others can answer or challenge.",
      done: coachingItem("reader_question")?.done ?? false,
    },
    {
      key: "excerpt",
      label: "Summary ready",
      helper: excerpt.trim()
        ? "Readers can judge the point from the feed."
        : "Add a one-sentence summary in publish review.",
      done: excerpt.trim().length > 0,
    },
    {
      key: "tags",
      label: "Tags selected",
      helper:
        tags.length > 0
          ? tags.slice(0, 3).join(", ")
          : "Add 1–5 topics in publish review.",
      done: tags.length > 0,
    },
    {
      key: "profile",
      label: "Profile complete",
      helper: profileInfo?.username
        ? `Publishing as @${profileInfo.username}`
        : "A username is needed before publishing.",
      done: Boolean(profileInfo?.username),
    },
    ...(needsReferences
      ? [
          {
            key: "references",
            label: "References added",
            helper:
              references.length > 0
                ? `${references.length} reference${references.length === 1 ? "" : "s"} added`
                : "Formal submissions need at least one source.",
            done: references.length > 0,
          },
        ]
      : []),
  ];

  const guideDone = guideChecklist.filter((i) => i.done).length;
  const guideTotal = guideChecklist.length;

  useEffect(() => {
    trackActivationEvent({
      event: "quality_check_viewed",
      metadata: {
        source: "write_coaching",
        postType,
        format: coachingSummary.formatLabel,
      },
    });
  }, [coachingSummary.formatLabel, postType]);

  useEffect(() => {
    coachingSummary.items.forEach((item) => {
      if (!item.done || completedTrackedRef.current.has(item.key)) return;
      completedTrackedRef.current.add(item.key);
      trackActivationEvent({
        event: "quality_check_completed",
        metadata: {
          source: "write_coaching",
          item: item.key,
          postType,
          completedCount: coachingSummary.completedCount,
          totalCount: coachingSummary.totalCount,
        },
      });
    });
  }, [coachingSummary, postType]);

  return (
    <aside className="space-y-3">
      {/* Section 1: Progress */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {selectedFormat.label}
          </span>
          <span className="text-xs font-medium text-gray-400">
            Suggested from your words
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-canvas px-3 py-2">
            <p className="text-base font-semibold text-ink">
              {wordCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Words</p>
          </div>
          <div className="rounded-lg bg-canvas px-3 py-2">
            <p className="text-base font-semibold text-ink">{estimatedReadTime}m</p>
            <p className="text-xs text-gray-500">Read time</p>
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] text-gray-400">
            <span>{saveStatusText}</span>
            <span>{Math.round(wordProgress)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-brand transition-[width] duration-300"
              style={{ width: `${Math.min(100, wordProgress)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            Target: {selectedFormat.minWords.toLocaleString()} words
          </p>
        </div>

      </section>

      {/* Section 2: Writing guide (shows once user starts) */}
      {hasStarted ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ink">Writing guide</h2>
            <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-gray-500">
              {guideDone}/{guideTotal}
            </span>
          </div>

          <div className="space-y-2.5">
            {guideChecklist.map((item) => (
              <div key={item.key} className="flex gap-3">
                <CheckIcon done={item.done} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">
                    {item.helper}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <DraftSignalPreview
              postType={postType}
              title={title}
              contentStarted={bodyStarted}
              tags={tags}
              excerpt={excerpt}
              references={references}
              coAuthors={coAuthors}
              profileComplete={Boolean(profileInfo?.username)}
              wordCount={wordCount}
              compact
            />
          </div>
        </section>
      ) : null}
    </aside>
  );
}
