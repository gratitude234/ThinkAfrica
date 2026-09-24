import { createClient } from "@/lib/supabase/server";
import { fetchCommentPage } from "@/lib/commentThread";
import CommentThread from "./CommentThread";

interface Props {
  readOnly?: boolean;
  postId: string;
  userId: string | null;
  userProfileId: string | null;
  /** False when "Discussion · N" is the only tier on the page and already
   *  names the count, so the thread does not repeat it. */
  showHeading: boolean;
  /** Counted once for the whole page, in the post route's secondary loader,
   *  and handed down. This component used to run its own countComments() with
   *  the same post id, so every post view spent two identical count queries on
   *  the comments table. */
  totalCount: number;
}

export default async function CommentsLoader({
  postId,
  userId,
  userProfileId,
  showHeading,
  totalCount,
  readOnly = false,
}: Props) {
  const supabase = await createClient();

  const page = await fetchCommentPage(supabase, {
    postId,
    viewerId: userId,
    viewerProfileId: userProfileId,
  });

  return (
    <CommentThread
      readOnly={readOnly}
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
