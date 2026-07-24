"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import { countShortPostCharacters, SHORT_POST_MAX_CHARACTERS } from "@/lib/shortPostContent";
import { createPost } from "./actions";

interface PostComposerFormProps {
  userId: string;
  parentPost?: { id: string; displayTitle: string } | null;
}

interface DraftBackup {
  body: string;
  imageUrl: string | null;
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
      return { body: candidate.body, imageUrl: candidate.imageUrl ?? null };
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
        writeDraftBackup(userId, { body, imageUrl });
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [body, imageUrl, submitting, userId, pendingRestore]);

  const restoreBackup = useCallback(() => {
    if (!pendingRestore) return;
    setBody(pendingRestore.body);
    setImageUrl(pendingRestore.imageUrl);
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

    const result = await createPost({ body, imageUrl, inResponseTo: parentPost?.id ?? null });

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
  }, [body, canSubmit, imageUrl, parentPost, router, submitting, userId]);

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
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
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

      <div className="flex flex-1 flex-col bg-canvas">
        <div className="flex min-h-[280px] flex-1 flex-col px-5 pt-5 sm:px-6">
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
            className={`min-h-[240px] w-full flex-1 resize-none rounded-lg border bg-transparent text-[22px] leading-[1.5] text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-2xl ${
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

        <div className="flex items-center justify-between gap-4 border-t border-black/[0.06] px-5 py-3 sm:px-6">
          <CoverImageUploader
            initialUrl={imageUrl ?? undefined}
            onUpload={(url) => setImageUrl(url)}
            onRemove={() => setImageUrl(null)}
            onUploadingChange={setUploading}
            emptyTitle="Add image"
            previewHeightClass="h-40"
            variant="compact"
          />
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

      <div className="px-5 py-5 sm:px-6">
        <p className="text-sm leading-6 text-gray-600">
          Quick takes are short and conversational, no title needed — they publish instantly.
          Writing something longer?
        </p>
        {/* The Create entry points go straight to this composer (no chooser
            interstitial), so the longer-form paths surface here instead. */}
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <Link
            href="/write?kind=article"
            className="inline-flex items-center gap-2 rounded-full bg-gold-tint px-4 py-2 text-sm font-semibold text-gold-ink transition-colors hover:bg-[#F1E4C8]"
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
            className="inline-flex items-center gap-2 rounded-full bg-purple-tint px-4 py-2 text-sm font-semibold text-purple-accent transition-colors hover:bg-[#E2DAEC]"
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
