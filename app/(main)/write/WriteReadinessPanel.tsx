"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  canOpenPublish: boolean;
  onChangeFormat: () => void;
  onReadyToPublish: () => void;
  children?: ReactNode;
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
  canOpenPublish,
  onChangeFormat,
  onReadyToPublish,
  children,
}: WriteReadinessPanelProps) {
  const [showOptional, setShowOptional] = useState(false);
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
    [
      content,
      excerpt,
      inResponseToTitle,
      postType,
      references,
      subtitle,
      tags,
      title,
      wordCount,
    ]
  );
  const needsReferences = postType === "research" || postType === "policy_brief";
  const bodyStarted = stripHtml(content).length > 0;
  const nextStep = (() => {
    if (!title.trim()) {
      return {
        title: "Title your idea",
        body: "Start by naming the question, claim, or observation you want readers to notice.",
      };
    }
    if (!bodyStarted) {
      return {
        title: "Write the first paragraph",
        body: "Lead with one clear claim, then add the example or evidence that makes it worth reading.",
      };
    }
    if (!profileInfo?.username) {
      return {
        title: "Complete your profile",
        body: "Add a username before publishing so readers can find your work.",
      };
    }
    if (needsReferences && references.length === 0) {
      return {
        title: "Add at least one source",
        body: "Formal submissions need a reference before they can enter review.",
      };
    }
    if (tags.length === 0) {
      return {
        title: "Review publish details",
        body: "Open the publish review to add topics and confirm how this will appear in the feed.",
      };
    }
    return {
      title: "Ready for final review",
      body: "Open details to confirm the summary, evidence signals, reader question, and publication settings.",
    };
  })();
  const checklist = [
    {
      label: "Title added",
      helper: title.trim() || "Give readers a clear signal.",
      done: title.trim().length > 0,
    },
    {
      label: "Body started",
      helper: bodyStarted
        ? `${wordCount.toLocaleString()} words drafted`
        : "Add a claim, why it matters, and one example or source.",
      done: bodyStarted,
    },
    {
      label: "Profile complete",
      helper: profileInfo?.username
        ? `Publishing as @${profileInfo.username}`
        : "A username is needed before publishing.",
      done: Boolean(profileInfo?.username),
    },
    {
      label: "Tags selected",
      helper:
        tags.length > 0
          ? tags.slice(0, 3).join(", ")
          : "Add 1 to 5 topics in the publish review.",
      done: tags.length > 0,
    },
    {
      label: "Excerpt ready",
      helper: excerpt.trim()
        ? "Readers can judge the point from the feed."
        : "Add a useful one-sentence summary or generate one during publish review.",
      done: excerpt.trim().length > 0,
    },
    {
      label: needsReferences ? "References added" : "References optional",
      helper: needsReferences
        ? references.length > 0
          ? `${references.length} reference${references.length === 1 ? "" : "s"} added`
          : "Formal submissions need at least one source."
        : "Optional, but sources or concrete examples help readers trust the argument.",
      done: needsReferences ? references.length > 0 : true,
    },
  ];

  const optionalChecklist = [
    {
      label: "Co-authors",
      helper:
        coAuthors.length > 0
          ? `${coAuthors.length} collaborator${coAuthors.length === 1 ? "" : "s"} added`
          : "Invite collaborators when the piece has shared authorship.",
      done: coAuthors.length > 0,
    },
    {
      label: "Response context",
      helper: inResponseToTitle
        ? `Responding to "${inResponseToTitle}"`
        : "Only needed when replying to an existing post.",
      done: Boolean(inResponseToTitle),
    },
  ];

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
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-brand">
              Create mode
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              {selectedFormat.label}
            </h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              {selectedFormat.desc}
            </p>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              {selectedFormat.requirementsSummary}
            </p>
          </div>
          <button
            type="button"
            onClick={onChangeFormat}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700"
          >
            Change
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-canvas px-3 py-2">
            <p className="text-lg font-semibold text-ink">
              {wordCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500">Words</p>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2">
            <p className="text-lg font-semibold text-ink">{estimatedReadTime}m</p>
            <p className="text-xs text-gray-500">Read time</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>{saveStatusText}</span>
            <span>{Math.round(wordProgress)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-brand transition-[width] duration-300"
              style={{ width: `${Math.min(100, wordProgress)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Target: {selectedFormat.minWords.toLocaleString()} words /{" "}
            {selectedFormat.review}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Draft coaching
        </p>
        <h3 className="mt-1 text-sm font-semibold text-ink">
          {coachingSummary.primaryAction.done
            ? nextStep.title
            : coachingSummary.primaryAction.label}
        </h3>
        <p className="mt-1 text-xs leading-5 text-emerald-900/75">
          {coachingSummary.primaryAction.done
            ? nextStep.body
            : coachingSummary.primaryAction.helper}
        </p>
        <p className="mt-2 text-xs leading-5 text-emerald-900/70">
          {coachingSummary.formatHint}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full bg-emerald-brand transition-[width] duration-300"
            style={{
              width: `${Math.round(
                (coachingSummary.completedCount / coachingSummary.totalCount) * 100
              )}%`,
            }}
          />
        </div>
        <p className="mt-2 text-[11px] font-medium text-emerald-800">
          {coachingSummary.completedCount}/{coachingSummary.totalCount} coaching checks
        </p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Quality coaching</h2>
            <p className="mt-1 text-xs text-gray-500">
              Guidance for clarity, evidence, and reader value.
            </p>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-gray-500">
            {coachingSummary.completedCount}/{coachingSummary.totalCount}
          </span>
        </div>

        <div className="space-y-3">
          {coachingSummary.items.map((item) => (
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
      </section>

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
      />

      {children ? <div className="space-y-3">{children}</div> : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Readiness</h2>
            <p className="mt-1 text-xs text-gray-500">
              Final checks still happen in publish review.
            </p>
          </div>
          <span className="rounded-full bg-canvas px-2.5 py-1 text-xs font-semibold text-gray-500">
            {checklist.filter((item) => item.done).length}/{checklist.length}
          </span>
        </div>

        <div className="space-y-3">
          {checklist.map((item) => (
            <div key={item.label} className="flex gap-3">
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

        <button
          type="button"
          onClick={() => setShowOptional((prev) => !prev)}
          className="mt-3 flex w-full items-center justify-between text-xs text-gray-400 hover:text-gray-600"
        >
          <span>Optional enhancements</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform ${showOptional ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showOptional ? (
          <div className="mt-2 space-y-3">
            {optionalChecklist.map((item) => (
              <div key={item.label} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-400"
                  aria-hidden="true"
                >
                  {item.done ? (
                    <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-500">{item.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-500">
                    {item.helper}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canOpenPublish}
          onClick={onReadyToPublish}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Review details
        </button>
      </section>
    </aside>
  );
}
