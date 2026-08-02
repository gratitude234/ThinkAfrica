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
}

/**
 * The discussion under any post, whatever its kind. Two tiers, in the order
 * they are used: comments (lightweight, on this page, no points) and then
 * Responses (published posts that answer this one, rendered as feed cards
 * because that is what they are).
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
}: Props) {
  return (
    <div className="mt-10">
      {isPublished ? <InlineResponseComposer parentPostId={postId} userId={userId} /> : null}

      <div className="mt-8">
        <Suspense
          fallback={
            <p className="text-[15px] text-gray-400">Loading comments…</p>
          }
        >
          <CommentsLoader postId={postId} userId={userId} userProfileId={userProfileId} />
        </Suspense>
      </div>

      {responseCards.length > 0 ? (
        <section id="responses" className="mt-10 scroll-mt-24">
          <h2 className="font-display text-[19px] font-semibold text-ink">
            Responses · {responseCount}
          </h2>
          <p className="mb-4 mt-1 text-[13px] text-gray-500">
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
              className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-[13.5px] font-semibold text-gray-700 transition-colors hover:border-emerald-brand/40 hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
            >
              Show more responses
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
