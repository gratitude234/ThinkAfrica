"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    <div className="flex min-h-[calc(100dvh-127px)] flex-col sm:min-h-[552px]">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close post composer"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
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
        <h1 className="min-w-0 flex-1 text-base font-normal text-gray-400">New post</h1>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="inline-flex h-11 min-w-[74px] items-center justify-center rounded-full bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-white disabled:opacity-100"
        >
          {submitting ? "Posting..." : "Post"}
        </button>
      </div>

      {parentPost ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Responding to
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-gray-900">
            {parentPost.displayTitle}
          </p>
        </div>
      ) : null}

      {pendingRestore ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>You have an unfinished post saved on this device.</span>
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

      <div className="flex min-h-[280px] flex-1 flex-col pt-4">
        <label htmlFor="post-body" className="sr-only">
          Post text
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
          className={`min-h-[260px] w-full flex-1 resize-none rounded-lg border bg-white px-1 py-3 text-[18px] leading-[1.65] text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-4 ${
            isOverLimit ? "border-red-300" : "border-transparent"
          }`}
        />
        {isOverLimit ? (
          <p id="post-body-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
            Posts can be at most {SHORT_POST_MAX_CHARACTERS.toLocaleString()} characters — trim{" "}
            {(characterCount - SHORT_POST_MAX_CHARACTERS).toLocaleString()} more.
          </p>
        ) : null}
      </div>

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between gap-4">
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
            {characterCount.toLocaleString()}/{SHORT_POST_MAX_CHARACTERS.toLocaleString()}
          </span>
        </div>

        <p className="mt-4 text-sm leading-5 text-gray-400">
          New post — Posts are short and conversational, no title needed. They publish instantly.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
