import { createClient } from "@/lib/supabase/server";
import CommentsSection from "./CommentsSection";

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
      "id, content, created_at, upvotes, profiles!comments_author_id_fkey (username, full_name, avatar_url)"
    )
    .eq("post_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const comments = (commentsRaw ?? []).map((c) => ({
    ...c,
    upvotes: (c as { upvotes?: number }).upvotes ?? 0,
    profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles,
  }));

  const commentIds = comments.map((c) => c.id);
  let userVotedCommentIds: string[] = [];
  if (userId && commentIds.length > 0) {
    const { data: votes } = await supabase
      .from("comment_votes")
      .select("comment_id")
      .eq("user_id", userProfileId)
      .in("comment_id", commentIds);
    userVotedCommentIds = votes?.map((v) => v.comment_id) ?? [];
  }

  return (
    <CommentsSection
      postId={postId}
      initialComments={comments as Parameters<typeof CommentsSection>[0]["initialComments"]}
      userId={userId}
      userProfileId={userProfileId}
      userVotedCommentIds={userVotedCommentIds}
    />
  );
}
