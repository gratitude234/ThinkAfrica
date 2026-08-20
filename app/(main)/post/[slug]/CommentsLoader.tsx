import { createClient } from "@/lib/supabase/server";
import { countComments, fetchCommentPage } from "@/lib/commentThread";
import CommentThread from "./CommentThread";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
  /** False when "Discussion · N" is the only tier on the page and already
   *  names the count, so the thread does not repeat it. */
  showHeading: boolean;
}

export default async function CommentsLoader({
  postId,
  userId,
  userProfileId,
  showHeading,
}: Props) {
  const supabase = await createClient();

  const [page, totalCount] = await Promise.all([
    fetchCommentPage(supabase, { postId, viewerId: userId, viewerProfileId: userProfileId }),
    countComments(supabase, postId),
  ]);

  return (
    <CommentThread
      postId={postId}
      initialComments={page.comments}
      initialTotalCount={totalCount}
      initialHasMore={page.hasMore}
      initialCursor={page.nextCursor}
      userId={userId}
      userProfileId={userProfileId}
      userVotedCommentIds={page.userVotedCommentIds}
      showHeading={showHeading}
    />
  );
}
