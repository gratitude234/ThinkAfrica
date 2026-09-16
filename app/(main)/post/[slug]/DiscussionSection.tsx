import { Suspense } from "react";
import CommentsLoader from "./CommentsLoader";
import InlineResponseComposer from "./InlineResponseComposer";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
  /** Drafts and rejected posts get the thread read-only. */
  isPublished: boolean;
  commentCount: number;
}

/**
 * The discussion under any post, whatever its kind: comments and their replies.
 *
 * It used to list Responses above the comments and add them to the heading
 * count. The publishing reset retired Responses as a product (Phase 2C). A post
 * published as a response before then is an ordinary Post or Article at its own
 * address, and nothing about it appears under the post it once answered.
 */
export default function DiscussionSection({
  postId,
  userId,
  userProfileId,
  isPublished,
  commentCount,
}: Props) {
  return (
    <div id="discussion" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-title font-semibold text-ink">
        Comments · {commentCount}
      </h2>

      {isPublished ? <InlineResponseComposer parentPostId={postId} userId={userId} /> : null}

      <div className="mt-8">
        <Suspense
          fallback={
            <p className="text-excerpt text-ink-muted">Loading comments…</p>
          }
        >
          <CommentsLoader
            postId={postId}
            userId={userId}
            userProfileId={userProfileId}
            showHeading={false}
            totalCount={commentCount}
          />
        </Suspense>
      </div>

      {/* A second composer at the foot of the thread. With only the one at the
          top, reading to the bottom of twenty comments and deciding to reply
          meant scrolling all the way back up. */}
      {isPublished && commentCount > 0 ? (
        <InlineResponseComposer
          parentPostId={postId}
          userId={userId}
          composerId="inline-response-foot"
          label="Write a comment"
        />
      ) : null}
    </div>
  );
}
