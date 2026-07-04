import { getBlockedUserIds } from "@/lib/blocking";
import { createClient } from "@/lib/supabase/server";
import CommentsSection, { type CommentItem } from "./CommentsSection";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
}

export default async function CommentsLoader({ postId, userId, userProfileId }: Props) {
  const supabase = await createClient();

  const [{ data: commentsRaw }, blockedIds] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, content, created_at, upvotes, parent_id, author_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
    getBlockedUserIds(userId),
  ]);

  const blockedSet = new Set(blockedIds);
  const normalizedComments = (commentsRaw ?? [])
    .filter((comment) => !blockedSet.has(comment.author_id as string))
    .map((comment) => ({
      ...comment,
      upvotes: (comment as { upvotes?: number }).upvotes ?? 0,
      parent_id: comment.parent_id as string | null,
      profiles: Array.isArray(comment.profiles) ? comment.profiles[0] : comment.profiles,
    }));

  const repliesByParent = normalizedComments.reduce(
    (acc, comment) => {
      if (!comment.parent_id) return acc;
      acc[comment.parent_id] = [...(acc[comment.parent_id] ?? []), comment];
      return acc;
    },
    {} as Record<string, typeof normalizedComments>
  );

  const initialComments: CommentItem[] = normalizedComments
    .filter((comment) => !comment.parent_id)
    .map((comment) => {
      const replies = repliesByParent[comment.id] ?? [];

      return {
        ...comment,
        parent_id: null,
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
    const profileId = userProfileId ?? userId;
    const { data: votes } = await supabase
      .from("comment_votes")
      .select("comment_id")
      .eq("user_id", profileId)
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
