import { Suspense } from "react";
import Link from "next/link";
import HomeFeedCard from "@/components/post/HomeFeedCard";
import type { PostCardData } from "@/components/post/PostCard";
import CommentsLoader from "./CommentsLoader";
import InlineResponseComposer from "./InlineResponseComposer";

interface Props {
  postId: string;
  userId: string | null;
  userProfileId: string | null;
  responseCount: number;
  responseCards: PostCardData[];
  responsesHasMore: boolean;
  /** `?responses=N` for the next page. */
  nextResponsePage: number;
  /** Drafts and rejected posts get the thread read-only. */
  isPublished: boolean;
  commentCount: number;
}

/**
 * The discussion under any post, whatever its kind. Two tiers: Responses
 * (published posts answering this one, rendered as feed cards because that is
 * what they are) and comments (lightweight, on this page, no points).
 *
 * Responses come first. They used to sit *below* the comments, so a reader had
 * to scroll past twenty of the lower-value artefact to discover that three of
 * the higher-value one existed -- Responses have their own pages, feed presence
 * and leaderboard scores. One heading carries the whole conversation's size so
 * neither tier is a surprise.
 */
export default function DiscussionSection({
  postId,
  userId,
  userProfileId,
  responseCount,
  responseCards,
  responsesHasMore,
  nextResponsePage,
  isPublished,
  commentCount,
}: Props) {
  const totalCount = commentCount + responseCount;

  return (
    <div id="discussion" className="mt-10 scroll-mt-24">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-title font-semibold text-ink">
          Discussion · {totalCount}
        </h2>
        {responseCount > 0 && commentCount > 0 ? (
          <p className="text-meta text-ink-muted">
            {responseCount} {responseCount === 1 ? "Response" : "Responses"},{" "}
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </p>
        ) : null}
      </div>

      {isPublished ? <InlineResponseComposer parentPostId={postId} userId={userId} /> : null}

      {responseCards.length > 0 ? (
        <section id="responses" className="mt-8 scroll-mt-24">
          <h3 className="text-excerpt font-semibold text-ink">
            Responses · {responseCount}
          </h3>
          <p className="mb-4 mt-0.5 text-meta text-ink-muted">
            Published posts answering this one.
          </p>
          <div>
            {responseCards.map((response) => (
              <HomeFeedCard
                key={response.id}
                post={response}
                currentUserId={userId}
                surface="latest"
                hideRespondingTo
                showTimestamp
              />
            ))}
          </div>

          {responsesHasMore ? (
            // A plain link, deliberately: a response renders as a HomeFeedCard,
            // which is a Server Component, so the next page has to come from the
            // server. scroll={false} keeps the reader where they were, and the
            // expanded thread stays linkable.
            <Link
              href={`?responses=${nextResponsePage}`}
              scroll={false}
              className="inline-flex min-h-11 items-center rounded-lg border border-card-border bg-surface px-4 text-byline font-semibold text-ink-soft transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              Show more responses
            </Link>
          ) : null}
        </section>
      ) : null}

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
            showHeading={responseCards.length > 0}
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
