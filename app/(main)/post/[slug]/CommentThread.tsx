"use client";

import { useCallback, useRef, useState } from "react";
import UserAvatar from "@/components/ui/UserAvatar";
import Toast from "@/components/ui/Toast";
import ReportButton from "@/components/moderation/ReportButton";
import { useGuestAuthGate } from "@/components/ui/GuestAuthGateProvider";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import {
  COMMENT_MAX_CHARACTERS,
  DELETED_COMMENT_TOMBSTONE,
  countCommentCharacters,
} from "@/lib/commentContent";
// Types erase at build time, so they can come from the server-only module.
// DEFAULT_COMMENT_SORT is a value and must not: importing it from
// commentThread would pull `server-only` into the client bundle.
import type { ThreadComment, ThreadReply } from "@/lib/commentThread";
import { DEFAULT_COMMENT_SORT, type CommentSort } from "@/lib/commentSort";
import { deleteComment, loadMoreComments, submitComment, updateComment } from "./commentActions";

export type { ThreadComment as CommentItem, ThreadReply as ReplyItem };

interface CommentThreadProps {
  postId: string;
  initialComments: ThreadComment[];
  initialTotalCount: number;
  initialHasMore: boolean;
  initialCursor: string | null;
  userId: string | null;
  userProfileId: string | null;
  userVotedCommentIds?: string[];
}

/** Replies shown before a chain collapses behind "Show N more replies". */
const REPLY_PREVIEW_COUNT = 3;

const ACTION_CLASS =
  "inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-meta font-medium text-ink-muted transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

function withVotes<T extends ThreadReply>(items: T[], votedIds: Set<string>): T[] {
  return items.map((item) => ({ ...item, userVoted: votedIds.has(item.id) }));
}

function hydrate(comments: ThreadComment[], votedIds: Set<string>): ThreadComment[] {
  return withVotes(comments, votedIds).map((comment) => ({
    ...comment,
    replies: withVotes(comment.replies, votedIds),
  }));
}

export default function CommentThread({
  postId,
  initialComments,
  initialTotalCount,
  initialHasMore,
  initialCursor,
  userId,
  userProfileId,
  userVotedCommentIds = [],
}: CommentThreadProps) {
  const { requestAuth } = useGuestAuthGate();
  const [comments, setComments] = useState<ThreadComment[]>(() =>
    hydrate(initialComments, new Set(userVotedCommentIds))
  );
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [sort, setSort] = useState<CommentSort>(DEFAULT_COMMENT_SORT);
  const [sorting, setSorting] = useState(false);
  // Long reply chains collapse to REPLY_PREVIEW_COUNT until asked for.
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  // Posting used to be announced to nobody: the composer refreshed the route
  // and a reply mutated local state, neither with a live region.
  const [announcement, setAnnouncement] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Deleting a comment cannot be undone, and Edit and Delete are adjacent text
  // buttons of the same size. The row asks first.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Guards against a slow page-1 response overwriting a later page-2 one.
  const loadRequestRef = useRef(0);

  const viewerId = userProfileId ?? userId;

  const mapComment = useCallback(
    (id: string, fn: (item: ThreadReply) => ThreadReply) =>
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === id
            ? ({ ...comment, ...fn(comment) } as ThreadComment)
            : {
                ...comment,
                replies: comment.replies.map((reply) =>
                  reply.id === id ? fn(reply) : reply
                ),
              }
        )
      ),
    []
  );

  const handleVote = async (commentId: string, currentlyVoted: boolean) => {
    if (!userId) {
      requestAuth("like", { contentKind: "post" });
      return;
    }

    const delta = currentlyVoted ? -1 : 1;
    mapComment(commentId, (item) => ({
      ...item,
      upvotes: Math.max(0, item.upvotes + delta),
      userVoted: !currentlyVoted,
    }));

    // Votes are the one comment mutation that goes through the RPC rather than
    // a server action: toggle_comment_vote is SECURITY DEFINER and is the only
    // thing that keeps comments.upvotes in step with comment_votes.
    const supabase = createClient();
    const { data, error } = await supabase.rpc("toggle_comment_vote", {
      p_comment_id: commentId,
    });

    if (error) {
      mapComment(commentId, (item) => ({
        ...item,
        upvotes: Math.max(0, item.upvotes - delta),
        userVoted: currentlyVoted,
      }));
      setToastMessage(error.message);
      return;
    }

    const result = data as { voted: boolean; upvotes: number } | null;
    if (result) {
      mapComment(commentId, (item) => ({
        ...item,
        upvotes: result.upvotes,
        userVoted: result.voted,
      }));
    }
  };

  const handleReply = async (parentId: string) => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const result = await submitComment({ postId, content: draft, parentId });
    setBusy(false);

    if (result.error) {
      setToastMessage(result.error);
      return;
    }
    if (!result.comment) return;

    const reply: ThreadReply = { ...result.comment, userVoted: false };
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === (result.comment?.parent_id ?? parentId)
          ? {
              ...comment,
              replies: [...comment.replies, reply],
              replyCount: comment.replyCount + 1,
            }
          : comment
      )
    );
    setTotalCount((count) => count + 1);
    setReplyingToId(null);
    setDraft("");
    setAnnouncement("Reply posted.");
    // A new reply on a collapsed chain must not land out of sight.
    setExpandedReplies((prev) => new Set(prev).add(result.comment?.parent_id ?? parentId));
  };

  const handleEdit = async (commentId: string) => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const result = await updateComment({ commentId, content: draft });
    setBusy(false);

    if (result.error) {
      setToastMessage(result.error);
      return;
    }

    mapComment(commentId, (item) => ({
      ...item,
      content: result.comment?.content ?? draft.trim(),
      updated_at: result.comment?.updated_at ?? new Date().toISOString(),
    }));
    setEditingId(null);
    setDraft("");
  };

  const handleDelete = async (commentId: string) => {
    if (busy) return;
    setBusy(true);
    const result = await deleteComment({ commentId });
    setBusy(false);
    setConfirmingDeleteId(null);

    if (result.error) {
      setToastMessage(result.error);
      return;
    }

    if (result.tombstoned) {
      // Replies exist, so the row survives with its text removed -- deleting it
      // outright would cascade and take those replies with it.
      mapComment(commentId, (item) => ({ ...item, content: DELETED_COMMENT_TOMBSTONE }));
      setToastMessage("Comment removed. The replies to it are still here.");
      return;
    }

    setComments((prev) =>
      prev
        .filter((comment) => comment.id !== commentId)
        .map((comment) => {
          const replies = comment.replies.filter((reply) => reply.id !== commentId);
          return replies.length === comment.replies.length
            ? comment
            : { ...comment, replies, replyCount: replies.length };
        })
    );
    setTotalCount((count) => Math.max(0, count - 1));
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoadingMore(true);
    setLoadMoreError(null);

    const result = await loadMoreComments({ postId, cursor, sort });

    if (loadRequestRef.current !== requestId) return;
    setLoadingMore(false);

    if (result.error || !result.page) {
      setLoadMoreError(result.error ?? "Could not load more comments.");
      return;
    }

    const votedIds = new Set(result.page.userVotedCommentIds);
    setComments((prev) => [...prev, ...hydrate(result.page!.comments, votedIds)]);
    setHasMore(result.page.hasMore);
    setCursor(result.page.nextCursor);
  };

  // Re-reads page one under the new order. Shares loadRequestRef with
  // "Load more" so a slow request from the old sort can't land on top of
  // the new one.
  const handleSortChange = async (nextSort: CommentSort) => {
    if (nextSort === sort || sorting) return;
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setSort(nextSort);
    setSorting(true);
    setLoadMoreError(null);

    const result = await loadMoreComments({ postId, cursor: null, sort: nextSort });

    if (loadRequestRef.current !== requestId) return;
    setSorting(false);

    if (result.error || !result.page) {
      setLoadMoreError(result.error ?? "Could not reorder the comments.");
      return;
    }

    const votedIds = new Set(result.page.userVotedCommentIds);
    setComments(hydrate(result.page.comments, votedIds));
    setHasMore(result.page.hasMore);
    setCursor(result.page.nextCursor);
  };

  /**
   * Replying to a reply.
   *
   * The thread is deliberately two levels deep, but the Reply button was simply
   * hidden on replies: no affordance, no mention, no explanation of why. It is
   * offered now, and posts to the same top-level parent with the person's name
   * prefilled, so the answer keeps its addressee without a third level.
   */
  const startReply = (comment: ThreadReply, isReply: boolean) => {
    if (!userId) {
      requestAuth("respond", { contentKind: "post" });
      return;
    }
    const parentId = isReply ? (comment.parent_id ?? comment.id) : comment.id;
    const name = comment.profiles?.username ?? comment.profiles?.full_name;

    setEditingId(null);
    setConfirmingDeleteId(null);
    setReplyingToId(parentId);
    setDraft(isReply && name ? `@${name} ` : "");
    if (isReply) setExpandedReplies((prev) => new Set(prev).add(parentId));
  };

  const renderRow = (comment: ThreadReply, isReply: boolean) => {
    const name = comment.profiles?.full_name ?? comment.profiles?.username ?? "Indegenius member";
    const isOwn = Boolean(viewerId && comment.author_id === viewerId);
    const isDeleted = comment.content === DELETED_COMMENT_TOMBSTONE;
    const isEditing = editingId === comment.id;
    const isConfirmingDelete = confirmingDeleteId === comment.id;
    const keepsReplies =
      "replies" in comment && (comment as ThreadComment).replies.length > 0;

    return (
      <div id={`comment-${comment.id}`} className="flex scroll-mt-24 gap-2.5">
        <UserAvatar
          name={name}
          src={comment.profiles?.avatar_url ?? null}
          size={isReply ? 26 : 32}
          className="mt-0.5 shrink-0 overflow-hidden rounded-full"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-byline font-semibold text-ink">{name}</span>
            {/* The timestamp is the permalink. A comment could not be linked to
                at all before, so there was no way to point anyone at one. */}
            <a
              href={`#comment-${comment.id}`}
              className="text-meta text-ink-muted underline-offset-2 hover:text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              {formatRelativeTime(comment.created_at)}
              {comment.updated_at && !isDeleted ? " · edited" : ""}
            </a>
          </div>

          {isEditing ? (
            <div className="mt-1.5">
              <label htmlFor={`edit-${comment.id}`} className="sr-only">
                Edit your comment
              </label>
              <textarea
                id={`edit-${comment.id}`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={2}
                maxLength={COMMENT_MAX_CHARACTERS}
                className="w-full resize-none rounded-lg border border-card-border bg-surface px-3 py-2 text-byline text-ink focus:border-emerald-brand focus:outline-none"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingId(null)} className={ACTION_CLASS}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleEdit(comment.id)}
                  disabled={busy || !draft.trim()}
                  className="inline-flex min-h-9 items-center rounded-lg bg-emerald-brand px-3 text-meta font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`mt-0.5 whitespace-pre-line text-byline ${
                isDeleted ? "italic text-ink-muted" : "text-ink"
              }`}
            >
              {comment.content}
            </p>
          )}

          {isDeleted || isEditing ? null : isConfirmingDelete ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-meta leading-5 text-red-900">
                Delete this comment?
                {keepsReplies ? " The replies to it stay." : ""}
              </p>
              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(null)}
                  className={ACTION_CLASS}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(comment.id)}
                  disabled={busy}
                  className="inline-flex min-h-9 items-center rounded-lg bg-red-600 px-3 text-meta font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
                >
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => void handleVote(comment.id, comment.userVoted ?? false)}
                aria-pressed={comment.userVoted ?? false}
                aria-label={comment.userVoted ? "Remove upvote" : "Upvote this comment"}
                className={`${ACTION_CLASS} ${comment.userVoted ? "text-emerald-brand" : ""}`}
              >
                Upvote{comment.upvotes > 0 ? ` ${comment.upvotes}` : ""}
              </button>
              <button
                type="button"
                onClick={() => startReply(comment, isReply)}
                className={ACTION_CLASS}
              >
                Reply
              </button>
              {isOwn ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToId(null);
                      setConfirmingDeleteId(null);
                      setEditingId(comment.id);
                      setDraft(comment.content);
                    }}
                    className={ACTION_CLASS}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(comment.id)}
                    className={`${ACTION_CLASS} hover:text-red-600`}
                  >
                    Delete
                  </button>
                </>
              ) : userId ? (
                <ReportButton
                  targetType="comment"
                  targetId={comment.id}
                  targetLabel={`a comment by ${name}`}
                  variant="text"
                  className="text-meta text-ink-muted hover:text-red-600"
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section id="comments" className="scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-title font-semibold text-ink">
          Comments · {totalCount}
        </h2>

        {/* The score has to change something, or the upvote button is a lie. */}
        {comments.length > 1 ? (
          <div
            role="group"
            aria-label="Sort comments"
            className="flex items-center gap-0.5 rounded-lg border border-card-border bg-surface p-0.5"
          >
            {(
              [
                { id: "top", label: "Top" },
                { id: "new", label: "Newest" },
              ] as Array<{ id: CommentSort; label: string }>
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => void handleSortChange(option.id)}
                disabled={sorting}
                aria-pressed={sort === option.id}
                className={`inline-flex min-h-8 items-center rounded-md px-3 text-meta font-semibold transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-1 ${
                  sort === option.id
                    ? "bg-emerald-brand text-white"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {comments.length === 0 ? (
        <p className="mt-4 text-excerpt text-ink-muted">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ul
          className={`mt-4 space-y-5 transition-opacity motion-reduce:transition-none ${
            sorting ? "opacity-50" : ""
          }`}
        >
          {comments.map((comment) => (
            <li key={comment.id}>
              {renderRow(comment, false)}

              {replyingToId === comment.id ? (
                <div className="ml-[42px] mt-2">
                  <label htmlFor={`reply-${comment.id}`} className="sr-only">
                    Write a reply
                  </label>
                  <textarea
                    id={`reply-${comment.id}`}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={2}
                    autoFocus
                    maxLength={COMMENT_MAX_CHARACTERS}
                    placeholder={`Reply to ${
                      comment.profiles?.full_name ?? comment.profiles?.username ?? "this comment"
                    }…`}
                    className="w-full resize-none rounded-lg border border-card-border bg-surface px-3 py-2 text-byline text-ink placeholder:text-ink-muted focus:border-emerald-brand focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-end gap-2">
                    {countCommentCharacters(draft) > COMMENT_MAX_CHARACTERS - 200 ? (
                      <span className="text-meta text-ink-muted">
                        {COMMENT_MAX_CHARACTERS - countCommentCharacters(draft)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToId(null);
                        setDraft("");
                      }}
                      className={ACTION_CLASS}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReply(comment.id)}
                      disabled={busy || !draft.trim()}
                      className="inline-flex min-h-9 items-center rounded-lg bg-emerald-brand px-3 text-meta font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Posting…" : "Post reply"}
                    </button>
                  </div>
                </div>
              ) : null}

              {comment.replies.length > 0 ? (
                (() => {
                  const expanded = expandedReplies.has(comment.id);
                  const hidden = comment.replies.length - REPLY_PREVIEW_COUNT;
                  const shown =
                    expanded || hidden <= 0
                      ? comment.replies
                      : comment.replies.slice(0, REPLY_PREVIEW_COUNT);

                  return (
                    <div className="ml-[42px] mt-3 border-l border-divider pl-3">
                      <ul className="space-y-4">
                        {shown.map((reply) => (
                          <li key={reply.id}>{renderRow(reply, true)}</li>
                        ))}
                      </ul>
                      {/* A forty-reply chain used to render all forty. */}
                      {!expanded && hidden > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReplies((prev) => new Set(prev).add(comment.id))
                          }
                          className={`${ACTION_CLASS} mt-2 text-emerald-brand`}
                        >
                          Show {hidden} more {hidden === 1 ? "reply" : "replies"}
                        </button>
                      ) : null}
                    </div>
                  );
                })()
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => void handleLoadMore()}
            disabled={loadingMore}
            className="inline-flex min-h-11 items-center rounded-lg border border-card-border bg-surface px-4 text-byline font-semibold text-ink-soft transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        </div>
      ) : null}

      {loadMoreError ? (
        <p className="mt-2 text-meta text-red-600">{loadMoreError}</p>
      ) : null}

      {/* One polite channel for the whole thread, carrying both failures and
          confirmations. Posting used to be announced to nobody, but two live
          regions would race each other, so the error text routes through here
          as well and the visible copy above is presentational. */}
      <p role="status" aria-live="polite" className="sr-only">
        {loadMoreError ?? announcement}
      </p>

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </section>
  );
}
