// -- Run in Supabase:
// ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS upvotes integer default 0;
// CREATE TABLE IF NOT EXISTS public.comment_votes (
//   user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
//   comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
//   PRIMARY KEY (user_id, comment_id)
// );

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  upvotes: number;
  userVoted?: boolean;
  profiles: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface CommentsSectionProps {
  postId: string;
  initialComments: Comment[];
  userId: string | null;
  userProfileId: string | null;
  userVotedCommentIds?: string[];
}

export default function CommentsSection({
  postId,
  initialComments,
  userId,
  userProfileId,
  userVotedCommentIds = [],
}: CommentsSectionProps) {
  const [existingComments, setExistingComments] = useState<Comment[]>(() =>
    [...initialComments]
      .map((c) => ({ ...c, userVoted: userVotedCommentIds.includes(c.id) }))
      .sort((a, b) => b.upvotes - a.upvotes)
  );
  const [newComments, setNewComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allComments = [...existingComments, ...newComments];
  const totalCount = allComments.length;

  const handleVote = async (commentId: string) => {
    if (!userId) return;

    const updateComments = (prev: Comment[]): Comment[] =>
      prev
        .map((c) => {
          if (c.id !== commentId) return c;
          const wasVoted = c.userVoted ?? false;
          return {
            ...c,
            upvotes: wasVoted ? c.upvotes - 1 : c.upvotes + 1,
            userVoted: !wasVoted,
          };
        })
        .sort((a, b) => b.upvotes - a.upvotes);

    // Check if it's in existing or new comments
    const inExisting = existingComments.some((c) => c.id === commentId);
    const target =
      (inExisting ? existingComments : newComments).find((c) => c.id === commentId);
    if (!target) return;

    const wasVoted = target.userVoted ?? false;

    // Optimistic update
    if (inExisting) {
      setExistingComments(updateComments);
    } else {
      setNewComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, upvotes: wasVoted ? c.upvotes - 1 : c.upvotes + 1, userVoted: !wasVoted }
            : c
        )
      );
    }

    const supabase = createClient();
    if (wasVoted) {
      await supabase
        .from("comment_votes")
        .delete()
        .eq("user_id", userId)
        .eq("comment_id", commentId);
      await supabase
        .from("comments")
        .update({ upvotes: target.upvotes - 1 })
        .eq("id", commentId);
    } else {
      await supabase
        .from("comment_votes")
        .insert({ user_id: userId, comment_id: commentId });
      await supabase
        .from("comments")
        .update({ upvotes: target.upvotes + 1 })
        .eq("id", commentId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        author_id: userProfileId,
        content: newComment.trim(),
      })
      .select(
        "id, content, created_at, upvotes, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
      )
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      const comment: Comment = {
        ...data,
        upvotes: data.upvotes ?? 0,
        userVoted: false,
        profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles,
      };
      setNewComments((prev) => [...prev, comment]);
      setNewComment("");
    }

    setLoading(false);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        {totalCount} {totalCount === 1 ? "Comment" : "Comments"}
      </h3>

      {/* Comment list */}
      <div className="space-y-4 mb-8">
        {totalCount === 0 && (
          <p className="text-gray-400 text-sm">
            No comments yet. Be the first to respond.
          </p>
        )}
        {allComments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">
              {comment.profiles?.full_name?.charAt(0)?.toUpperCase() ??
                comment.profiles?.username?.charAt(0)?.toUpperCase() ??
                "?"}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                <span className="text-sm font-medium text-gray-900">
                  {comment.profiles?.full_name ?? comment.profiles?.username}
                </span>
                {comment.upvotes >= 3 && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                    Top response
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {formatDate(comment.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-2">
                {comment.content}
              </p>
              {/* Upvote button */}
              <button
                onClick={() => handleVote(comment.id)}
                disabled={!userId}
                aria-label={comment.userVoted ? "Remove upvote" : "Upvote this comment"}
                className={`flex items-center gap-1 text-xs transition-colors ${
                  comment.userVoted
                    ? "text-emerald-600"
                    : "text-gray-400 hover:text-emerald-600"
                } disabled:opacity-50 disabled:cursor-default`}
              >
                <span className="text-base leading-none">▲</span>
                <span>{comment.upvotes}</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add comment */}
      {userId ? (
        <form onSubmit={handleSubmit}>
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-brand focus:border-transparent resize-none mb-2"
          />
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !newComment.trim()}
              className="px-4 py-2 bg-emerald-brand text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Posting..." : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
          <a
            href="/login"
            className="text-emerald-brand font-medium hover:underline"
          >
            Sign in
          </a>{" "}
          to leave a comment.
        </div>
      )}
    </div>
  );
}
