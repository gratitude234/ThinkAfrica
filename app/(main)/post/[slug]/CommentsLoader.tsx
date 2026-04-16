import { createClient } from "@/lib/supabase/server";
import CommentsSection, { type CommentItem } from "./CommentsSection";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
}

export default async function CommentsLoader({ postId, userId, userProfileId }: Props) {
  const supabase = await createClient();

  const { data: commentsRaw } = await supabase
    .from("comments")
    .select(
      "id, content, created_at, upvotes, parent_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
    )
    .eq("post_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const topLevelComments = (commentsRaw ?? []).map((comment) => ({
    ...comment,
    upvotes: (comment as { upvotes?: number }).upvotes ?? 0,
    parent_id: null,
    profiles: Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles,
  }));

  const repliesByParent = await Promise.all(
    topLevelComments.map(async (comment) => {
      const { data: repliesRaw } = await supabase
        .from("comments")
        .select(
          "id, content, created_at, upvotes, parent_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
        )
        .eq("post_id", postId)
        .eq("parent_id", comment.id)
        .order("created_at", { ascending: true });

      return {
        parentId: comment.id,
        replies: (repliesRaw ?? []).map((reply) => ({
          ...reply,
          upvotes: (reply as { upvotes?: number }).upvotes ?? 0,
          parent_id: reply.parent_id as string | null,
          profiles: Array.isArray(reply.profiles) ? reply.profiles[0] : reply.profiles,
        })),
      };
    })
  );

  const initialComments: CommentItem[] = topLevelComments.map((comment) => {
    const replies =
      repliesByParent.find((entry) => entry.parentId === comment.id)?.replies ?? [];

    return {
      ...comment,
      replies,
      replyCount: replies.length,
    };
  });

  const allCommentIds = initialComments.flatMap((comment) => [
    comment.id,
    ...comment.replies.map((reply) => reply.id),
  ]);

  let userVotedCommentIds: string[] = [];
  if (userId && allCommentIds.length > 0) {
    const { data: votes } = await supabase
      .from("comment_votes")
      .select("comment_id")
      .eq("user_id", userProfileId)
      .in("comment_id", allCommentIds);
    userVotedCommentIds = votes?.map((vote) => vote.comment_id) ?? [];
  }

  return (
    <CommentsSection
      postId={postId}
      initialComments={initialComments}
      userId={userId}
      userProfileId={userProfileId}
      userVotedCommentIds={userVotedCommentIds}
    />
  );
}
