"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ensureContributionDraft } from "@/app/(write)/write/actions";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import {
  COMMENT_MAX_CHARACTERS,
  countCommentCharacters,
} from "@/lib/commentContent";
import { submitComment } from "./commentActions";

interface InlineResponseComposerProps {
  parentPostId: string;
  userId: string | null;
  /** The thread renders a second composer at its foot, so the textarea id has
   *  to be unique. PostActionsRow scrolls to the default one by id. */
  composerId?: string;
  /** The foot composer sits under the thread it belongs to and needs no
   *  restatement of what the box is for. */
  label?: string;
}

const EDITOR_HREF = (postId: string) =>
  `/write?${new URLSearchParams({ inResponseTo: postId }).toString()}`;

function bodyToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Comments stay inline. A public response opens the same universal publishing
 * canvas used everywhere else, carrying any text already written with it.
 */
export default function InlineResponseComposer({
  parentPostId,
  userId,
  composerId = "inline-response",
  label = "Write a comment",
}: InlineResponseComposerProps) {
  const router = useRouter();
  const { requestAuth } = useGuestAuthGate();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const characters = countCommentCharacters(body);
  const overLimit = characters > COMMENT_MAX_CHARACTERS;
  const busy = submitting || promoting || refreshing;
  const canSubmit = characters > 0 && !overLimit && !busy;

  if (!userId) {
    return (
      <div className="mt-4 rounded-xl border border-card-border bg-surface px-4 py-4">
        <p className="text-excerpt text-ink-soft">Join the conversation.</p>
        <button
          type="button"
          onClick={() =>
            requestAuth("respond", {
              destination: EDITOR_HREF(parentPostId),
            })
          }
          className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Sign in to reply
        </button>
      </div>
    );
  }

  const reset = () => {
    setBody("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const postComment = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitComment({ postId: parentPostId, content: body });
      setSubmitting(false);

      if (result.error) {
        setError(result.error);
        return;
      }

      reset();
      startRefresh(() => router.refresh());
    } catch {
      setSubmitting(false);
      setError("Could not post this comment. Check your connection and try again.");
    }
  };

  const openFullEditor = async () => {
    if (busy) return;

    // An empty box can open the contextual editor directly. Once someone has
    // written anything, create the contribution draft first so navigation
    // carries both their words and the response relationship across.
    if (characters === 0) {
      router.push(EDITOR_HREF(parentPostId));
      return;
    }

    setPromoting(true);
    setError(null);
    try {
      const result = await ensureContributionDraft({
        draftId: null,
        snapshot: {
          title: "",
          content: bodyToHtml(body),
          excerpt: "",
          tags: [],
          coverImageUrl: "",
          references: [],
          collaborators: [],
          inResponseToId: parentPostId,
          promptId: null,
        },
      });

      if (result.error || !result.draftId) {
        setPromoting(false);
        setError(result.error ?? "Could not open the editor. Try again.");
        return;
      }

      reset();
      router.push(`/write?draft=${result.draftId}`);
    } catch {
      setPromoting(false);
      setError("Could not open the editor. Check your connection and try again.");
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-card-border bg-surface px-4 py-3">
      <label htmlFor={composerId} className="sr-only">
        {label}
      </label>
      <textarea
        id={composerId}
        ref={textareaRef}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          const node = event.target;
          node.style.height = "auto";
          node.style.height = `${node.scrollHeight}px`;
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void postComment();
          }
        }}
        rows={2}
        disabled={busy}
        placeholder="Add a comment…"
        aria-describedby={error ? `${composerId}-error` : undefined}
        className="w-full resize-none bg-transparent text-lede text-ink outline-none placeholder:text-ink-muted disabled:opacity-60"
      />

      {error ? (
        <p id={`${composerId}-error`} role="alert" className="mt-1 text-meta text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-divider pt-2">
        <button
          type="button"
          onClick={() => void openFullEditor()}
          disabled={busy}
          aria-busy={promoting || undefined}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-meta font-semibold text-ink-muted underline-offset-2 hover:bg-canvas hover:text-emerald-brand hover:underline disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          {promoting ? "Opening editor…" : "Open editor"}
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {characters >= COMMENT_MAX_CHARACTERS - 200 ? (
            <span className={`text-meta ${overLimit ? "font-semibold text-red-600" : "text-ink-muted"}`}>
              {COMMENT_MAX_CHARACTERS - characters}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void postComment()}
            disabled={!canSubmit}
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {submitting ? "Posting…" : refreshing ? "Posted" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
