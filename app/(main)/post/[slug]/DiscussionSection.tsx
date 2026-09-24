import { Suspense } from "react";
import CommentsLoader from "./CommentsLoader";
import InlineResponseComposer from "./InlineResponseComposer";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
  isPublished: boolean;
  commentCount: number;
}

/** Shared discussion grammar for Articles and Posts. The visual treatment is
 * intentionally flatter than the old comments card so the conversation reads
 * as the continuation of the publication, not a second application surface. */
export default function DiscussionSection({
  postId,
  userId,
  userProfileId,
  isPublished,
  commentCount,
}: Props) {
  return (
    <section id="discussion" className="publication-discussion scroll-mt-24 border-t border-card-border pt-6 sm:pt-[26px]">
      <div className="flex items-baseline gap-2">
        <h2 className="font-public-sans text-[17px] font-semibold text-[#1B2420] sm:text-[18px]">
          Discussion
        </h2>
        <span className="font-public-sans text-[12px] text-ink-faint sm:text-[13px]">
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </span>
      </div>

      {isPublished ? (
        <InlineResponseComposer parentPostId={postId} userId={userId} />
      ) : (
        <p className="mt-4 font-public-sans text-[13.5px] text-ink-muted">
          Discussion is read-only while this publication is unpublished.
        </p>
      )}

      <div className="mt-5 sm:mt-6">
        <Suspense fallback={<p className="font-public-sans text-[13.5px] text-ink-muted">Loading comments…</p>}>
          <CommentsLoader
            postId={postId}
            userId={userId}
            userProfileId={userProfileId}
            showHeading={false}
            totalCount={commentCount}
          />
        </Suspense>
      </div>
    </section>
  );
}
