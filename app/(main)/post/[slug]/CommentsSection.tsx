"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

interface Comment {
  id: string;
  content: string;
  created_at: string;
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
}

export default function CommentsSection({
  postId,
  initialComments,
  userId,
  userProfileId,
}: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        "id, content, created_at, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
      )
      .single();

    if (insertError) {
      setError(insertError.message);
    } else if (data) {
      const comment = {
        ...data,
        profiles: Array.isArray(data.profiles)
          ? data.profiles[0]
          : data.profiles,
      } as Comment;
      setComments((prev) => [...prev, comment]);
      setNewComment("");
    }

    setLoading(false);
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
      </h3>

      {/* Comment list */}
      <div className="space-y-4 mb-8">
        {comments.length === 0 && (
          <p className="text-gray-400 text-sm">
            No comments yet. Be the first to respond.
          </p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0 mt-0.5">
              {comment.profiles?.full_name?.charAt(0)?.toUpperCase() ??
                comment.profiles?.username?.charAt(0)?.toUpperCase() ??
                "?"}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {comment.profiles?.full_name ?? comment.profiles?.username}
                </span>
                <span className="text-xs text-gray-400">
                  {formatDate(comment.created_at)}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {comment.content}
              </p>
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
          {error && (
            <p className="text-sm text-red-600 mb-2">{error}</p>
          )}
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
          <a href="/login" className="text-emerald-brand font-medium hover:underline">
            Sign in
          </a>{" "}
          to leave a comment.
        </div>
      )}
    </div>
  );
}
