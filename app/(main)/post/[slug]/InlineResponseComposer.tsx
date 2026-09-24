"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import UserAvatar from "@/components/ui/UserAvatar";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import { COMMENT_MAX_CHARACTERS, countCommentCharacters } from "@/lib/commentContent";
import { submitComment } from "./commentActions";

interface InlineResponseComposerProps {
  parentPostId: string;
  userId: string | null;
  composerId?: string;
  label?: string;
}

export default function InlineResponseComposer({
  parentPostId,
  userId,
  composerId = "inline-response",
  label = "Add to the discussion",
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

  if (!userId) {
    return (
      <div className="mt-4 flex items-center gap-3 font-public-sans sm:mt-[18px]">
        <UserAvatar name="You" src={null} size={36} className="shrink-0 overflow-hidden rounded-full" />
        <button
          type="button"
          onClick={() => requestAuth("respond", { contentKind: "post" })}
          className="min-h-11 flex-1 rounded-[10px] border border-card-border bg-transparent px-3.5 text-left text-[14px] text-ink-faint transition-colors hover:border-emerald-brand/30 hover:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Sign in to join the discussion…
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

  return (
    <div className="mt-4 flex items-start gap-3 font-public-sans sm:mt-[18px]">
      <UserAvatar name="You" src={null} size={36} className="mt-0.5 shrink-0 overflow-hidden rounded-full" />
      <div className="min-w-0 flex-1">
        <label htmlFor={composerId} className="sr-only">{label}</label>
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
          rows={1}
          disabled={busy}
          placeholder="Add to the discussion…"
          aria-describedby={error ? `${composerId}-error` : undefined}
          className="min-h-11 w-full resize-none rounded-[10px] border border-card-border bg-transparent px-3.5 py-2.5 text-[14px] leading-5 text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-emerald-brand/50 disabled:opacity-60"
        />

        {error ? <p id={`${composerId}-error`} role="alert" className="mt-1 text-[12px] text-red-600">{error}</p> : null}

        <div className="mt-2 flex items-center justify-end gap-2">
          {characters >= COMMENT_MAX_CHARACTERS - 200 ? (
            <span className={`text-[11.5px] ${overLimit ? "font-semibold text-red-600" : "text-ink-muted"}`}>
              {COMMENT_MAX_CHARACTERS - characters}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void postComment()}
            disabled={!canSubmit}
            className="inline-flex min-h-9 items-center rounded-lg bg-emerald-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#0E4B37] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {submitting ? "Posting…" : refreshing ? "Posted" : "Comment"}
          </button>
        </div>
      </div>
    </div>
  );
}
