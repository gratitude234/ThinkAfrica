"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CoverImageUploader from "@/components/ui/CoverImageUploader";
import PublishingTopicSelector from "@/components/topic/PublishingTopicSelector";
import { countShortPostCharacters, SHORT_POST_MAX_CHARACTERS } from "@/lib/shortPostContent";
import { MAX_SHORT_POST_TOPICS } from "@/lib/tags";
import { createPost, promoteToArticle } from "./actions";

interface PostComposerFormProps {
  userId: string;
  parentPost?: { id: string; displayTitle: string } | null;
  editorialPrompt?: {
    id: string;
    title: string;
    promptText: string;
    responseQuestion: string | null;
    topic: string | null;
  } | null;
}

interface DraftBackup {
  body: string;
  imageUrl: string | null;
  topics: string[];
}

const SAVE_DELAY_MS = 500;
type SaveStatus = "idle" | "saving" | "saved" | "error";

function getDraftContext(
  parentPostId: string | null,
  promptId: string | null
): string {
  if (parentPostId) return `response:${parentPostId}`;
  if (promptId) return `prompt:${promptId}`;
  return "standalone";
}

function draftKey(userId: string, context: string): string {
  return `indegenius:post-draft:${userId}:${context}`;
}

function legacyDraftKey(userId: string): string {
  return `indegenius:post-draft:${userId}`;
}

function readDraftBackup(userId: string, context: string): DraftBackup | null {
  if (typeof window === "undefined") return null;

  try {
    // The old key had no intent context. Only offer it in the standalone
    // composer so a Post draft can never appear inside an unrelated response
    // or campus-prompt flow.
    const raw =
      window.localStorage.getItem(draftKey(userId, context)) ??
      (context === "standalone"
        ? window.localStorage.getItem(legacyDraftKey(userId))
        : null);
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

function writeDraftBackup(userId: string, context: string, backup: DraftBackup) {
  try {
    window.localStorage.setItem(draftKey(userId, context), JSON.stringify(backup));
    if (context === "standalone") {
      window.localStorage.removeItem(legacyDraftKey(userId));
    }
    return true;
  } catch {
    // localStorage can throw in private mode or when its quota is full.
    return false;
  }
}

function clearDraftBackup(userId: string, context: string) {
  try {
    window.localStorage.removeItem(draftKey(userId, context));
    if (context === "standalone") {
      window.localStorage.removeItem(legacyDraftKey(userId));
    }
  } catch {
    // See writeDraftBackup.
  }
}

export default function PostComposerForm({
  userId,
  parentPost = null,
  editorialPrompt = null,
}: PostComposerFormProps) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [topics, setTopics] = useState<string[]>(() =>
    editorialPrompt?.topic ? [editorialPrompt.topic] : []
  );
  const [showTopics, setShowTopics] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<DraftBackup | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasEditedRef = useRef(false);
  const suppressBackupRef = useRef(false);
  const backupContext = getDraftContext(
    parentPost?.id ?? null,
    editorialPrompt?.id ?? null
  );
  const latestBackupRef = useRef<DraftBackup>({ body: "", imageUrl: null, topics: [] });

  useEffect(() => {
    latestBackupRef.current = { body, imageUrl, topics };
  }, [body, imageUrl, topics]);

  useEffect(() => {
    const backup = readDraftBackup(userId, backupContext);
    if (backup && backup.body.trim().length > 0) {
      setPendingRestore(backup);
    }
  }, [backupContext, userId]);

  const persistLatestBackup = useCallback(() => {
    if (!hasEditedRef.current || suppressBackupRef.current) return;
    const backup = latestBackupRef.current;
    if (backup.body.trim().length === 0) {
      clearDraftBackup(userId, backupContext);
      return;
    }
    writeDraftBackup(userId, backupContext, backup);
  }, [backupContext, userId]);

  // A tab close or route change can happen inside the 500ms debounce window.
  // Flush the latest user-edited value so the final keystrokes are not the
  // ones most likely to disappear.
  useEffect(() => {
    const handlePageHide = () => persistLatestBackup();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      persistLatestBackup();
    };
  }, [persistLatestBackup]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Never touch storage while an unactioned restore offer is showing --
    // the initial render's empty `body` would otherwise race the mount
    // effect above and wipe the just-read backup before the user ever
    // gets to press "Restore". Autosave resumes once the user restores
    // (pendingRestore clears, body is repopulated) or discards
    // (pendingRestore clears, storage is already cleared explicitly).
    //
    // `promoting` is held to the same rule: once the body has been handed to
    // the Article composer, this timer must not write it back, or the next
    // visit here would offer to restore a draft that has already moved.
    if (
      submitting ||
      promoting ||
      pendingRestore ||
      !hasEditedRef.current ||
      suppressBackupRef.current
    ) {
      return undefined;
    }

    setSaveStatus("saving");

    saveTimer.current = setTimeout(() => {
      if (body.trim().length === 0) {
        clearDraftBackup(userId, backupContext);
        setSaveStatus("idle");
      } else {
        const saved = writeDraftBackup(userId, backupContext, {
          body,
          imageUrl,
          topics,
        });
        setSaveStatus(saved ? "saved" : "error");
      }
    }, SAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [backupContext, body, imageUrl, pendingRestore, promoting, submitting, topics, userId]);

  // "Write an article" must not cost someone the paragraphs they already
  // typed. With a body present the text becomes a real Article draft first,
  // and the composer opens that draft instead of a blank canvas.
  const handleWriteArticle = useCallback(async () => {
    if (uploading) {
      setError("Wait for the image upload to finish before changing formats.");
      return;
    }
    if (body.trim().length === 0) {
      const params = new URLSearchParams({ kind: "article" });
      if (parentPost?.id) params.set("inResponseTo", parentPost.id);
      router.push(`/write?${params.toString()}`);
      return;
    }

    // Keep a local copy until the server confirms that the Article draft
    // exists. A failed format switch must never cost the writer their text.
    persistLatestBackup();
    suppressBackupRef.current = true;
    setPromoting(true);
    setError(null);

    try {
      const result = await promoteToArticle({
        body,
        imageUrl,
        topics,
        inResponseTo: parentPost?.id ?? null,
      });

      if (result.error || !result.draftId) {
        suppressBackupRef.current = false;
        setPromoting(false);
        setError(result.error ?? "Could not open the Article composer. Try again.");
        return;
      }

      // Only now is the text safely on the server, so the local Post backup can
      // go without any window where the draft exists in neither place.
      clearDraftBackup(userId, backupContext);
      router.push(`/write?draft=${result.draftId}`);
    } catch {
      suppressBackupRef.current = false;
      setPromoting(false);
      setError("Could not open the Article composer. Check your connection and try again.");
    }
  }, [backupContext, body, imageUrl, parentPost, persistLatestBackup, router, topics, uploading, userId]);

  const restoreBackup = useCallback(() => {
    if (!pendingRestore) return;
    setBody(pendingRestore.body);
    setImageUrl(pendingRestore.imageUrl);
    setTopics(pendingRestore.topics);
    setShowTopics(pendingRestore.topics.length > 0);
    setSaveStatus("saved");
    setPendingRestore(null);
    textareaRef.current?.focus();
  }, [pendingRestore]);

  const dismissBackup = useCallback(() => {
    clearDraftBackup(userId, backupContext);
    setSaveStatus("idle");
    setPendingRestore(null);
  }, [backupContext, userId]);

  const characterCount = countShortPostCharacters(body);
  const isEmpty = characterCount === 0;
  const isOverLimit = characterCount > SHORT_POST_MAX_CHARACTERS;
  const canSubmit =
    !isEmpty && !isOverLimit && !submitting && !promoting && !uploading;

  const closeComposer = useCallback(() => {
    if (typeof window !== "undefined" && document.referrer) {
      try {
        if (new URL(document.referrer).origin === window.location.origin) {
          router.back();
          return;
        }
      } catch {
        // An invalid or opaque referrer falls through to the safe home route.
      }
    }
    router.push("/");
  }, [router]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitting) return;

    persistLatestBackup();
    suppressBackupRef.current = true;
    setSubmitting(true);
    setError(null);

    try {
      const result = await createPost({
        body,
        imageUrl,
        inResponseTo: parentPost?.id ?? null,
        promptId: editorialPrompt?.id ?? null,
        topics,
      });

      if (result.error || !result.slug) {
        suppressBackupRef.current = false;
        setError(result.error ?? "Failed to publish. Please try again.");
        setSubmitting(false);
        return;
      }

      // "post_submitted" is recorded server-side in createPost() (matching
      // the write/actions.ts convention) -- don't also fire it here, or
      // every publish records two rows.
      clearDraftBackup(userId, backupContext);
      router.push(`/post/${result.slug}?justPublished=1&live=1`);
    } catch {
      suppressBackupRef.current = false;
      setSubmitting(false);
      setError("Could not publish this Post. Check your connection and try again.");
    }
  }, [backupContext, body, canSubmit, editorialPrompt, imageUrl, parentPost, persistLatestBackup, router, submitting, topics, userId]);

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
          onClick={closeComposer}
          disabled={uploading || submitting || promoting}
          aria-label="Close post composer"
          aria-busy={uploading || undefined}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-canvas hover:text-ink disabled:cursor-wait disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-ink">
            {parentPost ? "New Response" : "New Post"}
          </h1>
          <p className="text-[11px] font-medium text-ink-muted">
            Public · publishes immediately
          </p>
        </div>
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

      {editorialPrompt ? (
        <div className="mx-4 mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 sm:mx-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Campus editorial prompt
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {editorialPrompt.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            {editorialPrompt.promptText}
          </p>
          {editorialPrompt.responseQuestion ? (
            <p className="mt-2 text-xs font-medium text-emerald-800">
              Response question: {editorialPrompt.responseQuestion}
            </p>
          ) : null}
        </div>
      ) : null}

      {pendingRestore ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:mx-5">
          <span>You have an unfinished Post saved on this device.</span>
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
            {parentPost ? "Response text" : "Post text"}
          </label>
          <textarea
            ref={textareaRef}
            id="post-body"
            value={body}
            onChange={(event) => {
              hasEditedRef.current = true;
              setBody(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              parentPost
                ? "What would you add, challenge, or clarify?"
                : editorialPrompt
                  ? "Share a clear point, example, or question in response..."
                  : "Share an idea, observation, or question..."
            }
            rows={8}
            autoFocus
            disabled={submitting || promoting}
            aria-describedby="post-body-count post-body-error"
            className={`min-h-[240px] w-full flex-1 resize-none rounded-lg border bg-transparent text-[22px] leading-[1.5] text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-2xl md:h-[clamp(220px,30vh,300px)] md:min-h-0 md:flex-none md:text-[22px] ${
              isOverLimit ? "border-red-300" : "border-transparent"
            }`}
          />
          {isOverLimit ? (
            <p id="post-body-error" role="alert" className="mt-1 text-xs font-medium text-red-600">
              Posts can be at most {SHORT_POST_MAX_CHARACTERS.toLocaleString()} characters.
              Trim {(characterCount - SHORT_POST_MAX_CHARACTERS).toLocaleString()} more.
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
              disabled={submitting || promoting}
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
              <div
                aria-disabled={submitting || promoting || undefined}
                className={submitting || promoting ? "pointer-events-none opacity-60" : undefined}
              >
                <CoverImageUploader
                  initialUrl={imageUrl ?? undefined}
                  onUpload={(url) => {
                    hasEditedRef.current = true;
                    setImageUrl(url);
                  }}
                  onRemove={() => {
                    hasEditedRef.current = true;
                    setImageUrl(null);
                  }}
                  onUploadingChange={setUploading}
                  emptyTitle="Add image"
                  previewHeightClass="h-40"
                  variant="compact"
                />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                <span
                  role="status"
                  aria-live="polite"
                  className={`text-xs ${saveStatus === "error" ? "text-red-600" : "text-gray-400"}`}
                >
                  {saveStatus === "saving"
                    ? "Saving..."
                    : saveStatus === "saved"
                      ? "Saved on this device"
                      : saveStatus === "error"
                        ? "Device backup unavailable"
                      : ""}
                </span>
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
                onChange={(nextTopics) => {
                  hasEditedRef.current = true;
                  setTopics(nextTopics);
                }}
                disabled={submitting || promoting}
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
            Posts are public, titleless contributions that publish immediately.
            Writing something longer?
          </span>
          <span className="hidden whitespace-nowrap md:inline">Need more room?</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2.5 md:mt-0 md:flex-nowrap md:gap-1">
          <button
            type="button"
            onClick={handleWriteArticle}
            disabled={promoting || submitting || uploading}
            aria-busy={promoting || uploading || undefined}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-gold-tint px-4 py-2 text-sm font-semibold text-gold-ink transition-colors hover:bg-[#F1E4C8] disabled:opacity-60 md:rounded-lg md:bg-transparent md:px-2.5 md:hover:bg-gold-tint"
          >
            {promoting ? (
              <svg
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
              </svg>
            ) : (
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
            )}
            {promoting ? "Moving your draft" : "Write an article"}
          </button>
          {!parentPost ? (
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
          ) : null}
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
