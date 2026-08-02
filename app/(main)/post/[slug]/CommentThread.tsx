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
import type { ThreadComment, ThreadReply } from "@/lib/commentThread";
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

const ACTION_CLASS =
  "inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[12.5px] font-medium text-gray-500 transition-colors hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2";

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
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

    const result = await loadMoreComments({ postId, cursor });

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

  const startReply = (commentId: string) => {
    if (!userId) {
      requestAuth("respond", { contentKind: "post" });
      return;
    }
    setEditingId(null);
    setReplyingToId(commentId);
    setDraft("");
  };

  const renderRow = (comment: ThreadReply, isReply: boolean) => {
    const name = comment.profiles?.full_name ?? comment.profiles?.username ?? "Indegenius member";
    const isOwn = Boolean(viewerId && comment.author_id === viewerId);
    const isDeleted = comment.content === DELETED_COMMENT_TOMBSTONE;
    const isEditing = editingId === comment.id;

    return (
      <div className="flex gap-2.5">
        <UserAvatar
          name={name}
          src={comment.profiles?.avatar_url ?? null}
          size={isReply ? 26 : 32}
          className="mt-0.5 shrink-0 overflow-hidden rounded-full"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-semibold text-ink">{name}</span>
            <span className="text-[12px] text-gray-400">
              {formatRelativeTime(comment.created_at)}
              {comment.updated_at && !isDeleted ? " · edited" : ""}
            </span>
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
                className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14.5px] leading-[1.55] text-gray-900 focus:border-emerald-brand focus:outline-none"
              />
              <div className="mt-1.5 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingId(null)} className={ACTION_CLASS}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleEdit(comment.id)}
                  disabled={busy || !draft.trim()}
                  className="inline-flex min-h-9 items-center rounded-lg bg-emerald-brand px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p
              className={`mt-0.5 whitespace-pre-line text-[14.5px] leading-[1.6] ${
                isDeleted ? "italic text-gray-400" : "text-gray-800"
              }`}
            >
              {comment.content}
            </p>
          )}

          {isDeleted || isEditing ? null : (
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
              {isReply ? null : (
                <button type="button" onClick={() => startReply(comment.id)} className={ACTION_CLASS}>
                  Reply
                </button>
              )}
              {isOwn ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToId(null);
                      setEditingId(comment.id);
                      setDraft(comment.content);
                    }}
                    className={ACTION_CLASS}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(comment.id)}
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
                  className="text-[12.5px] text-gray-400 hover:text-red-600"
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
      <h2 className="font-display text-[19px] font-semibold text-ink">
        Comments · {totalCount}
      </h2>

      {comments.length === 0 ? (
        <p className="mt-4 text-[15px] text-gray-500">
          No comments yet. Start the conversation.
        </p>
      ) : (
        <ul className="mt-4 space-y-5">
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
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-[14.5px] leading-[1.55] text-gray-900 placeholder:text-gray-400 focus:border-emerald-brand focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-end gap-2">
                    {countCommentCharacters(draft) > COMMENT_MAX_CHARACTERS - 200 ? (
                      <span className="text-[12px] text-gray-400">
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
                      className="inline-flex min-h-9 items-center rounded-lg bg-emerald-brand px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Posting…" : "Post reply"}
                    </button>
                  </div>
                </div>
              ) : null}

              {comment.replies.length > 0 ? (
                <ul className="ml-[42px] mt-3 space-y-4 border-l border-gray-100 pl-3">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>{renderRow(reply, true)}</li>
                  ))}
                </ul>
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
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className={loadMoreError ? "mt-2 text-[13px] text-red-600" : "sr-only"}>
        {loadMoreError ?? ""}
      </p>

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </section>
  );
}
