"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import PublishingTopicSelector from "@/components/topic/PublishingTopicSelector";
import { countShortPostCharacters, SHORT_POST_MAX_CHARACTERS } from "@/lib/shortPostContent";
import { MAX_SHORT_POST_TOPICS } from "@/lib/tags";
import { createPost } from "./actions";

interface PostComposerFormProps {
  userId: string;
  parentPost?: { id: string; displayTitle: string } | null;
}

interface DraftBackup {
  body: string;
  imageUrl: string | null;
  topics: string[];
}

const SAVE_DELAY_MS = 500;

function draftKey(userId: string): string {
  return `indegenius:post-draft:${userId}`;
}

function readDraftBackup(userId: string): DraftBackup | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { body?: unknown }).body === "string" &&
      ((parsed as { imageUrl?: unknown }).imageUrl === null ||
        typeof (parsed as { imageUrl?: unknown }).imageUrl === "string")
    ) {
      const candidate = parsed as { body: string; imageUrl: string | null };
      return {
        body: candidate.body,
        imageUrl: candidate.imageUrl ?? null,
        topics: Array.isArray((parsed as { topics?: unknown }).topics)
          ? ((parsed as { topics: unknown[] }).topics.filter(
              (topic): topic is string => typeof topic === "string"
            ))
          : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

function writeDraftBackup(userId: string, backup: DraftBackup) {
  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(backup));
  } catch {
    // localStorage can throw (private mode, quota) -- losing the local
    // backup isn't fatal, so fail silently rather than block composing.
  }
}

function clearDraftBackup(userId: string) {
  try {
    window.localStorage.removeItem(draftKey(userId));
  } catch {
    // See writeDraftBackup.
  }
}

export default function PostComposerForm({ userId, parentPost = null }: PostComposerFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [showTopics, setShowTopics] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<DraftBackup | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const backup = readDraftBackup(userId);
    if (backup && backup.body.trim().length > 0) {
      setPendingRestore(backup);
    }
  }, [userId]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Never touch storage while an unactioned restore offer is showing --
    // the initial render's empty `body` would otherwise race the mount
    // effect above and wipe the just-read backup before the user ever
    // gets to press "Restore". Autosave resumes once the user restores
    // (pendingRestore clears, body is repopulated) or discards
    // (pendingRestore clears, storage is already cleared explicitly).
    if (submitting || pendingRestore) return undefined;

    saveTimer.current = setTimeout(() => {
      if (body.trim().length === 0) {
        clearDraftBackup(userId);
      } else {
        writeDraftBackup(userId, { body, imageUrl, topics });
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [body, imageUrl, pendingRestore, submitting, topics, userId]);

  const restoreBackup = useCallback(() => {
    if (!pendingRestore) return;
    setBody(pendingRestore.body);
    setImageUrl(pendingRestore.imageUrl);
    setTopics(pendingRestore.topics);
    setShowTopics(pendingRestore.topics.length > 0);
    setPendingRestore(null);
    textareaRef.current?.focus();
  }, [pendingRestore]);

  const dismissBackup = useCallback(() => {
    clearDraftBackup(userId);
    setPendingRestore(null);
  }, [userId]);

  const characterCount = countShortPostCharacters(body);
  const isEmpty = characterCount === 0;
  const isOverLimit = characterCount > SHORT_POST_MAX_CHARACTERS;
  const canSubmit = !isEmpty && !isOverLimit && !submitting && !uploading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    const result = await createPost({
      body,
      imageUrl,
      inResponseTo: parentPost?.id ?? null,
      topics,
    });

    if (result.error || !result.slug) {
      setError(result.error ?? "Failed to publish. Please try again.");
      setSubmitting(false);
      return;
    }

    // "post_submitted" is recorded server-side in createPost() (matching
    // the write/actions.ts convention) -- don't also fire it here, or
    // every publish records two rows.
    clearDraftBackup(userId);
    router.push(`/post/${result.slug}`);
  }, [body, canSubmit, imageUrl, parentPost, router, submitting, topics, userId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="flex flex-1 flex-col md:flex-none">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5 md:px-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close post composer"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth={1.8}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 text-lg font-bold text-ink">New quick take</h1>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="inline-flex h-10 min-w-[72px] items-center justify-center rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-emerald-brand/40 disabled:text-white disabled:opacity-100"
        >
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>

      {parentPost ? (
        <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 sm:mx-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Responding to
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
            {parentPost.displayTitle}
          </p>
        </div>
      ) : null}

      {pendingRestore ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-5">
          <span>You have an unfinished quick take saved on this device.</span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={restoreBackup}
              className="font-semibold text-amber-900 underline underline-offset-2"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={dismissBackup}
              className="text-amber-700 underline underline-offset-2"
            >
              Discard
            </button>
          </span>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col bg-canvas md:flex-none">
        <div className="flex min-h-[280px] flex-1 flex-col px-5 pt-5 sm:px-6 md:min-h-0 md:flex-none md:px-8 md:py-6">
          <label htmlFor="post-body" className="sr-only">
            Quick take text
          </label>
          <textarea
            ref={textareaRef}
            id="post-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What's on your mind?"
            rows={8}
            autoFocus
            aria-describedby="post-body-count post-body-error"
            className={`min-h-[240px] w-full flex-1 resize-none rounded-lg border bg-transparent text-[22px] leading-[1.5] text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-2xl md:h-[clamp(220px,30vh,300px)] md:min-h-0 md:flex-none md:text-[22px] ${
              isOverLimit ? "border-red-300" : "border-transparent"
            }`}
          />
          {isOverLimit ? (
            <p id="post-body-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
              Quick takes can be at most {SHORT_POST_MAX_CHARACTERS.toLocaleString()} characters —
              trim {(characterCount - SHORT_POST_MAX_CHARACTERS).toLocaleString()} more.
            </p>
          ) : null}
        </div>

        <div className="border-t border-black/[0.06]">
          <div
            data-testid="post-composer-toolbar"
            className="flex flex-col md:min-h-16 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-8 md:py-2.5"
          >
            <button
              type="button"
              onClick={() => setShowTopics((current) => !current)}
              aria-expanded={showTopics}
              aria-controls="post-topics-panel"
              className="flex min-h-16 w-full items-center justify-between gap-3 px-5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold sm:px-6 md:min-h-11 md:w-auto md:justify-start md:rounded-lg md:border md:border-gray-200 md:bg-white md:px-4 md:py-0 md:text-gray-600 md:transition-colors md:hover:border-gray-300 md:hover:bg-white md:hover:text-gray-900 md:focus-visible:ring-offset-2"
            >
              <span className="md:hidden">
                <span className="block text-sm font-semibold text-gray-800">
                  Add topics (optional)
                </span>
                <span className="block text-xs text-gray-500">
                  Help interested readers find this post.
                </span>
              </span>
              <span className="hidden items-center gap-2 text-sm font-medium md:inline-flex">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82Z" />
                  <path d="M7.5 6.5h.01" />
                </svg>
                Topics
                {topics.length > 0 ? (
                  <span className="rounded-full bg-green-tint px-1.5 py-0.5 text-[11px] font-semibold text-emerald-brand">
                    {topics.length}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-xs font-medium text-emerald-brand md:hidden">
                {topics.length > 0
                  ? `${topics.length}/${MAX_SHORT_POST_TOPICS}`
                  : showTopics
                    ? "Hide"
                    : "Add"}
              </span>
            </button>

            <div className="flex items-center justify-between gap-4 border-t border-black/[0.06] px-5 py-3 sm:px-6 md:contents">
              <CoverImageUploader
                initialUrl={imageUrl ?? undefined}
                onUpload={(url) => setImageUrl(url)}
                onRemove={() => setImageUrl(null)}
                onUploadingChange={setUploading}
                emptyTitle="Add image"
                previewHeightClass="h-40"
                variant="compact"
              />
              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                <span aria-hidden="true" className="hidden text-xs text-gray-400 md:inline">
                  Ctrl/⌘ + Enter
                </span>
                <span aria-hidden="true" className="hidden text-gray-300 md:inline">
                  ·
                </span>
                <span
                  id="post-body-count"
                  className={`shrink-0 text-sm ${
                    isOverLimit ? "font-semibold text-red-600" : "text-gray-400"
                  }`}
                >
                  {characterCount}/{SHORT_POST_MAX_CHARACTERS}
                </span>
              </div>
            </div>
          </div>

          {showTopics ? (
            <div
              id="post-topics-panel"
              className="border-t border-black/[0.06] px-5 py-4 sm:px-6 md:px-8"
            >
              <PublishingTopicSelector
                contentKind="post"
                content={body}
                value={topics}
                maxTopics={MAX_SHORT_POST_TOPICS}
                onChange={setTopics}
                disabled={submitting}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div
        data-testid="post-composer-footer"
        className="px-5 py-5 sm:px-6 md:flex md:items-center md:justify-between md:gap-6 md:border-t md:border-black/[0.06] md:px-8 md:py-4"
      >
        <p className="text-sm leading-6 text-gray-600">
          <span className="md:hidden">
            Quick takes are short and conversational, no title needed — they publish instantly.
            Writing something longer?
          </span>
          <span className="hidden whitespace-nowrap md:inline">Need more room?</span>
        </p>
        {/* The Create entry points go straight to this composer (no chooser
            interstitial), so the longer-form paths surface here instead. */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5 md:mt-0 md:flex-nowrap md:gap-1">
          <Link
            href="/write?kind=article"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gold-tint px-4 py-2 text-sm font-semibold text-gold-ink transition-colors hover:bg-[#F1E4C8] md:rounded-lg md:bg-transparent md:px-2.5 md:hover:bg-gold-tint"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487 18.55 2.8a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897l12.682-12.68Z"
              />
            </svg>
            Write an article
          </Link>
          <Link
            href="/submit/research"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-purple-tint px-4 py-2 text-sm font-semibold text-purple-accent transition-colors hover:bg-[#E2DAEC] md:rounded-lg md:bg-transparent md:px-2.5 md:hover:bg-purple-tint"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 12h3m-3 3h3M6.75 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
              />
            </svg>
            Submit research
          </Link>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
