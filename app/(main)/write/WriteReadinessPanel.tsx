"use client";

import type { PostReferenceRecord } from "@/lib/types";
import type { PostType } from "@/lib/utils";
import { WRITE_FORMATS } from "./writeConfig";
import type { CoAuthorProfile } from "@/components/collaboration/CoAuthorPicker";

interface WriteReadinessPanelProps {
  postType: PostType;
  title: string;
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
      {done ? "Y" : ""}
    </span>
  );
}

export default function WriteReadinessPanel({
  postType,
  title,
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
}: WriteReadinessPanelProps) {
  const selectedFormat =
    WRITE_FORMATS.find((item) => item.type === postType) ?? WRITE_FORMATS[0];
  const needsReferences = postType === "research" || postType === "policy_brief";
  const bodyStarted = stripHtml(content).length > 0;
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
        : "Add the first argument, example, or section.",
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
        ? "Feed summary is ready."
        : "We can generate one when you publish.",
      done: excerpt.trim().length > 0,
    },
    {
      label: needsReferences ? "References added" : "References optional",
      helper: needsReferences
        ? references.length > 0
          ? `${references.length} reference${references.length === 1 ? "" : "s"} added`
          : "Formal submissions need at least one source."
        : "Add sources in the publish review if useful.",
      done: needsReferences ? references.length > 0 : true,
    },
    {
      label: "Coauthors optional",
      helper:
        coAuthors.length > 0
          ? `${coAuthors.length} collaborator${coAuthors.length === 1 ? "" : "s"} added`
          : "Invite collaborators when the piece has shared authorship.",
      done: true,
    },
    {
      label: "Response context",
      helper: inResponseToTitle
        ? `Responding to "${inResponseToTitle}"`
        : "Only needed when replying to an existing post.",
      done: true,
    },
  ];

  return (
    <aside className="space-y-4">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
              Create mode
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">
              {selectedFormat.label}
            </h2>
            <p className="mt-1 text-sm leading-5 text-gray-500">
              {selectedFormat.desc}
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
              className="h-full rounded-full bg-emerald-brand transition-all duration-300"
              style={{ width: `${Math.min(100, wordProgress)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Target: {selectedFormat.minWords.toLocaleString()} words /{" "}
            {selectedFormat.review}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
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
          disabled={!canOpenPublish}
          onClick={onReadyToPublish}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-emerald-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ready to publish
        </button>
      </section>
    </aside>
  );
}
