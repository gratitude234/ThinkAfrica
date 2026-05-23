"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import ProfileGate from "@/components/ui/ProfileGate";
import { formatRelativeTime } from "@/lib/utils";
import { trackActivationEvent } from "@/lib/activationEvents";
import ResponseStartLink from "@/components/post/ResponseStartLink";
import { submitComment } from "../commentActions";

interface CommentAuthor {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ReplyItem {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  parent_id: string | null;
  userVoted?: boolean;
  profiles: CommentAuthor | null;
}

export interface CommentItem extends ReplyItem {
  replies: ReplyItem[];
  replyCount: number;
}

interface CommentsSectionProps {
  postId: string;
  initialComments: CommentItem[];
  userId: string | null;
  userProfileId: string | null;
  userVotedCommentIds?: string[];
}

function sortCommentsByUpvotes<T extends { upvotes: number }>(items: T[]) {
  return [...items].sort((a, b) => b.upvotes - a.upvotes);
}

const COMMENT_PROMPTS = [
  { label: "Question", text: "Question: " },
  { label: "Evidence", text: "Evidence to add: " },
  { label: "Counterpoint", text: "Counterpoint: " },
  { label: "Clarification", text: "Clarification needed: " },
];

export default function CommentsSection({
  postId,
  initialComments,
  userId,
  userProfileId,
  userVotedCommentIds = [],
}: CommentsSectionProps) {
  const [comments, setComments] = useState<CommentItem[]>(() =>
    sortCommentsByUpvotes(
      initialComments.map((comment) => ({
        ...comment,
        userVoted: userVotedCommentIds.includes(comment.id),
        replies: comment.replies.map((reply) => ({
          ...reply,
          userVoted: userVotedCommentIds.includes(reply.id),
        })),
      }))
    )
  );
  const [newComment, setNewComment] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [collapsedReplies, setCollapsedReplies] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<{
    full_name: string | null;
    username: string | null;
    university: string | null;
  } | null>(null);
  const [loadingProfileInfo, setLoadingProfileInfo] = useState(true);
  const [isProfileGateOpen, setIsProfileGateOpen] = useState(false);
  const pendingSubmitRef = useRef<{ parentId: string | null } | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoadingProfileInfo(false);
      return;
    }

    const supabase = createClient();
    const profileId = userProfileId ?? userId;

    supabase
      .from("profiles")
      .select("full_name, username, university")
      .eq("id", profileId)
      .single()
      .then(({ data }) => {
        setProfileInfo(data ?? null);
        setLoadingProfileInfo(false);
      });
  }, [userId, userProfileId]);

  const totalCount = useMemo(
    () => comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0),
    [comments]
  );

  const updateVote = (items: CommentItem[], commentId: string) =>
    sortCommentsByUpvotes(
      items.map((comment) => {
        if (comment.id === commentId) {
          const wasVoted = comment.userVoted ?? false;
          return {
            ...comment,
            upvotes: wasVoted ? comment.upvotes - 1 : comment.upvotes + 1,
            userVoted: !wasVoted,
          };
        }

        return {
          ...comment,
          replies: comment.replies.map((reply) => {
            if (reply.id !== commentId) return reply;
            const wasVoted = reply.userVoted ?? false;
            return {
              ...reply,
              upvotes: wasVoted ? reply.upvotes - 1 : reply.upvotes + 1,
              userVoted: !wasVoted,
            };
          }),
        };
      })
    );

  const setVoteState = (
    items: CommentItem[],
    commentId: string,
    upvotes: number,
    userVoted: boolean
  ) =>
    sortCommentsByUpvotes(
      items.map((comment) => {
        if (comment.id === commentId) {
          return { ...comment, upvotes, userVoted };
        }

        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === commentId ? { ...reply, upvotes, userVoted } : reply
          ),
        };
      })
    );

  const handleVote = async (commentId: string) => {
    if (!userId) return;

    const previousComments = comments;
    setComments((prev) => updateVote(prev, commentId));

    const supabase = createClient();
    const { data, error: voteError } = await supabase.rpc("toggle_comment_vote", {
      p_comment_id: commentId,
    });

    if (voteError) {
      setComments(previousComments);
      setToastMessage(voteError.message);
      return;
    }

    const result = data as { voted: boolean; upvotes: number } | null;
    if (result) {
      setComments((prev) =>
        setVoteState(prev, commentId, result.upvotes, result.voted)
      );
    }
  };

  const handleSubmit = async (
    parentId: string | null = null,
    bypassProfileGate = false
  ) => {
    const content = parentId ? replyContent : newComment;
    if (!content.trim()) return;
    if (!bypassProfileGate && loadingProfileInfo) return;

    if (!bypassProfileGate && userId && !profileInfo?.username) {
      pendingSubmitRef.current = { parentId };
      setIsProfileGateOpen(true);
      return;
    }

    if (parentId) {
      setReplyLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const result = await submitComment({
      postId,
      content,
      parentId,
    });

    if (result.error) {
      if (parentId) {
        setToastMessage(result.error);
      } else {
        setError(result.error);
      }
    } else if (result.comment) {
      const commentData = {
        ...result.comment,
        userVoted: false,
      };

      if (parentId) {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === parentId
              ? {
                  ...comment,
                  replies: [...comment.replies, commentData],
                  replyCount: comment.replyCount + 1,
                }
              : comment
          )
        );
        setReplyingToId(null);
        setReplyContent("");
        setCollapsedReplies((prev) => {
          const next = new Set(prev);
          next.delete(parentId);
          return next;
        });
      } else {
        setComments((prev) =>
          sortCommentsByUpvotes([
            ...prev,
            {
              ...commentData,
              replies: [],
              replyCount: 0,
            },
          ])
        );
        setNewComment("");
      }

      trackActivationEvent({
        event: "comment_submitted",
        metadata: {
          postId,
          parent: Boolean(parentId),
          length: content.trim().length,
        },
      });
    }

    setLoading(false);
    setReplyLoading(false);
  };

  const toggleReplies = (commentId: string) => {
    setCollapsedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });
  };

  const renderComment = (comment: ReplyItem, parentId?: string) => (
    <div key={comment.id} className="flex gap-3">
      {comment.profiles?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comment.profiles.avatar_url}
          alt={comment.profiles.full_name ?? comment.profiles.username ?? "Comment author"}
          className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
          {comment.profiles?.full_name?.charAt(0)?.toUpperCase() ??
            comment.profiles?.username?.charAt(0)?.toUpperCase() ??
            "?"}
        </div>
      )}
      <div className="flex-1">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="text-sm font-medium text-gray-900">
            {comment.profiles?.full_name ?? comment.profiles?.username}
          </span>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(comment.created_at)}
          </span>
        </div>
        <p className="mb-2 text-sm leading-relaxed text-gray-700">{comment.content}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleVote(comment.id)}
            disabled={!userId}
            aria-label={comment.userVoted ? "Remove upvote" : "Upvote this comment"}
            className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
              comment.userVoted
                ? "bg-emerald-50 text-emerald-700"
                : "text-gray-500 hover:bg-gray-50 hover:text-emerald-600"
            } disabled:cursor-default disabled:opacity-50`}
          >
            <span>Upvote</span>
            <span>{comment.upvotes}</span>
          </button>
          {parentId ? null : (
            <button
              type="button"
              onClick={() => {
                setReplyingToId(comment.id);
                setReplyContent("");
              }}
              className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-emerald-600"
            >
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:rounded-lg sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-gray-900">
          {totalCount} {totalCount === 1 ? "Comment" : "Comments"}
        </h3>
        <span className="hidden h-px flex-1 bg-gray-200 sm:block" aria-hidden="true" />
      </div>

      <div className="mb-8 space-y-6">
        {totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-5 text-center sm:rounded-lg">
            <p className="text-sm font-medium text-gray-900">
              Start the discussion with a useful move.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Ask a question, add evidence, offer a counterpoint, or write a full
              response if you have a developed argument.
            </p>
            <ResponseStartLink
              postId={postId}
              source="empty_comments"
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Write a response instead
            </ResponseStartLink>
          </div>
        ) : null}

        {comments.map((comment) => {
          const repliesCollapsed = collapsedReplies.has(comment.id);

          return (
            <div key={comment.id}>
              {renderComment(comment)}

              {comment.replyCount > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleReplies(comment.id)}
                  className="mt-1 inline-flex min-h-8 cursor-pointer items-center rounded-lg px-1 text-xs font-medium text-gray-500 hover:text-emerald-700"
                >
                  {comment.replyCount} {comment.replyCount === 1 ? "reply" : "replies"}
                </button>
              ) : null}

              {replyingToId === comment.id ? (
                <div className="ml-10 mt-3 rounded-xl border border-gray-200 bg-canvas p-3 max-[420px]:ml-0 sm:rounded-lg">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    rows={2}
                    placeholder="Reply with a question, evidence, counterpoint, or clarification..."
                    className="mb-2 min-h-[92px] w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm leading-6 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
                  />
                  {replyContent.trim().length >= 220 ? (
                    <div className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      This is becoming substantive.{" "}
                      <ResponseStartLink
                        postId={postId}
                        source="long_reply"
                        className="font-semibold underline"
                      >
                        Turn it into a response post
                      </ResponseStartLink>
                      .
                    </div>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingToId(null);
                        setReplyContent("");
                      }}
                      className="min-h-10 rounded-lg px-3 py-2 text-xs font-medium text-gray-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit(comment.id)}
                      disabled={replyLoading || !replyContent.trim()}
                      className="min-h-10 rounded-lg bg-emerald-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {replyLoading ? "Posting..." : "Post reply"}
                    </button>
                  </div>
                </div>
              ) : null}

              {comment.replies.length > 0 && !repliesCollapsed ? (
                <div className="ml-10 mt-4 space-y-4 border-l-2 border-gray-100 pl-4">
                  {comment.replies.map((reply) => renderComment(reply, comment.id))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {userId ? (
        <form
          className="rounded-xl border border-gray-200 bg-canvas p-3 sm:rounded-lg sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Ask a question, add evidence, offer a counterpoint, or request clarification..."
            rows={3}
            className="mb-3 min-h-[116px] w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm leading-6 focus:border-emerald-brand focus:outline-none focus:ring-0"
          />
          <div className="mb-3 flex flex-wrap gap-2">
            {COMMENT_PROMPTS.map((prompt) => (
              <button
                key={prompt.label}
                type="button"
                onClick={() =>
                  setNewComment((current) =>
                    current.trim() ? current : prompt.text
                  )
                }
                className="min-h-9 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-emerald-200 hover:text-emerald-700"
              >
                {prompt.label}
              </button>
            ))}
          </div>
          {newComment.trim().length >= 280 ? (
            <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              This reads like a substantive argument.{" "}
              <ResponseStartLink
                postId={postId}
                source="long_comment"
                className="font-semibold underline"
              >
                Turn it into a response post
              </ResponseStartLink>
              .
            </div>
          ) : null}
          {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !newComment.trim()}
              className="min-h-10 w-full rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Posting..." : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-canvas px-4 py-4 text-sm leading-6 text-gray-500 sm:rounded-lg">
          <Link
            href="/login"
            className="font-medium text-emerald-brand hover:underline"
          >
            Sign in
          </Link>{" "}
          to leave a comment.
        </div>
      )}

      <ProfileGate
        open={isProfileGateOpen && !!userId}
        userId={userProfileId ?? userId ?? ""}
        initialProfile={profileInfo}
        onClose={() => {
          pendingSubmitRef.current = null;
          setIsProfileGateOpen(false);
        }}
        onComplete={(profile) => {
          setProfileInfo(profile);
          setIsProfileGateOpen(false);
          const pending = pendingSubmitRef.current;
          pendingSubmitRef.current = null;
          if (pending) {
            void handleSubmit(pending.parentId, true);
          }
        }}
      />

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </section>
  );
}
