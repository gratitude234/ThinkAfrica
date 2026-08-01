"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createPost } from "@/app/(write)/create/post/actions";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import {
  countShortPostCharacters,
  SHORT_POST_MAX_CHARACTERS,
} from "@/lib/shortPostContent";

interface InlineResponseComposerProps {
  parentPostId: string;
  userId: string | null;
}

// The counter is noise until the limit is actually in reach.
const COUNTER_VISIBLE_FROM = SHORT_POST_MAX_CHARACTERS - 200;

const LONG_FORM_HREF = (postId: string) =>
  `/write?${new URLSearchParams({ inResponseTo: postId, kind: "article" }).toString()}`;

/**
 * Replying to a short Post shouldn't cost a page navigation. This posts the
 * response in place and refreshes the thread; the long-form flow stays one
 * click away for anyone who wants the full editor.
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

  const characters = countShortPostCharacters(body);
  const remaining = SHORT_POST_MAX_CHARACTERS - characters;
  const busy = submitting || refreshing;
  const canSubmit = characters > 0 && remaining >= 0 && !busy;

  if (!userId) {
    return (
      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-4">
        <p className="text-[15px] text-gray-600">Join the conversation.</p>
        <button
          type="button"
          onClick={() => requestAuth("respond", { contentKind: "post" })}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Sign in to respond
        </button>
      </div>
    );
  }

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const result = await createPost({ body, topics: [], inResponseTo: parentPostId });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setBody("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    startRefresh(() => router.refresh());
  };

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <label htmlFor="inline-response" className="sr-only">
        Write a response
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
            void submit();
          }
        }}
        rows={2}
        disabled={busy}
        placeholder="Write a response…"
        aria-describedby={error ? "inline-response-error" : undefined}
        className="w-full resize-none bg-transparent text-[16px] leading-[1.6] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60"
      />

      {error ? (
        <p id="inline-response-error" role="alert" className="mt-1 text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
        <Link
          href={LONG_FORM_HREF(parentPostId)}
          className="text-[13px] text-gray-500 underline-offset-2 hover:text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Write a long-form response
        </Link>
        <div className="flex items-center gap-3">
          {characters >= COUNTER_VISIBLE_FROM ? (
            <span className={`text-[13px] ${remaining < 0 ? "font-semibold text-red-600" : "text-gray-400"}`}>
              {remaining}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            {submitting ? "Posting…" : refreshing ? "Posted" : "Respond"}
          </button>
        </div>
      </div>
    </div>
  );
}
