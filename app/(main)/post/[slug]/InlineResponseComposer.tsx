"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createPost } from "@/app/(write)/create/post/actions";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import {
  COMMENT_MAX_CHARACTERS,
  COMMENT_PROMOTION_THRESHOLD,
  countCommentCharacters,
} from "@/lib/commentContent";
import { submitComment } from "./commentActions";

interface InlineResponseComposerProps {
  parentPostId: string;
  userId: string | null;
}

const LONG_FORM_HREF = (postId: string) =>
  `/write?${new URLSearchParams({ inResponseTo: postId, kind: "article" }).toString()}`;

/**
 * The single reply box. It writes a **comment** by default -- lightweight, on
 * the parent, worth no points -- and offers promotion to a Response, which is a
 * published post with its own page, feed presence and score.
 *
 * The choice is deliberately made *after* writing rather than before: asking
 * someone to classify a reply they haven't written yet is a question they can't
 * answer, which is what the old Quick/Long-form chooser asked. Past
 * COMMENT_PROMOTION_THRESHOLD the box suggests the upgrade, but never takes it
 * on its own.
 */
export default function InlineResponseComposer({
  parentPostId,
  userId,
}: InlineResponseComposerProps) {
  const router = useRouter();
  const { requestAuth } = useGuestAuthGate();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const characters = countCommentCharacters(body);
  const overLimit = characters > COMMENT_MAX_CHARACTERS;
  const busy = submitting || refreshing;
  const canSubmit = characters > 0 && !overLimit && !busy;
  const suggestResponse = characters >= COMMENT_PROMOTION_THRESHOLD;

  if (!userId) {
    return (
      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
        <p className="text-[15px] text-gray-600">Join the conversation.</p>
        <button
          type="button"
          onClick={() => requestAuth("respond", { contentKind: "post" })}
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

    const result = await submitComment({ postId: parentPostId, content: body });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    reset();
    startRefresh(() => router.refresh());
  };

  const postAsResponse = async () => {
    if (characters === 0 || busy) return;
    setSubmitting(true);
    setError(null);

    const result = await createPost({ body, topics: [], inResponseTo: parentPostId });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    reset();
    startRefresh(() => router.refresh());
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <label htmlFor="inline-response" className="sr-only">
        Write a comment
      </label>
      <textarea
        id="inline-response"
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
        aria-describedby={error ? "inline-response-error" : undefined}
        className="w-full resize-none bg-transparent text-[16px] leading-[1.6] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60"
      />

      {suggestResponse ? (
        <p className="mt-1 rounded-lg bg-green-tint px-3 py-2 text-[13px] leading-[1.5] text-emerald-brand">
          This is long enough to stand on its own. Publishing it as a{" "}
          <strong className="font-semibold">Response</strong> gives it its own page and
          puts it in the feed, on your profile, and on the leaderboard.
        </p>
      ) : null}

      {error ? (
        <p id="inline-response-error" role="alert" className="mt-1 text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void postAsResponse()}
            disabled={characters === 0 || overLimit || busy}
            className="text-[13px] font-medium text-gray-600 underline-offset-2 hover:text-emerald-brand hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Publish as a Response
          </button>
          <Link
            href={LONG_FORM_HREF(parentPostId)}
            className="text-[13px] text-gray-500 underline-offset-2 hover:text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Long-form
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {characters >= COMMENT_MAX_CHARACTERS - 200 ? (
            <span className={`text-[13px] ${overLimit ? "font-semibold text-red-600" : "text-gray-400"}`}>
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
