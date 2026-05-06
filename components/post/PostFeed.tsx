import Link from "next/link";
import PostCard, { PostCardData } from "./PostCard";
import DebateInterlude, { type DebateInterludeData } from "./DebateInterlude";
import PeopleInterlude from "./PeopleInterlude";
import TopicInterlude from "./TopicInterlude";

type FeedTabKey = "home" | "following" | "latest";

interface PostFeedProps {
  posts: PostCardData[];
  activeTab: FeedTabKey;
  activeDebate?: DebateInterludeData | null;
  peopleSuggestions?: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  }[];
  peopleSuggestionReason?: string;
  prioritizePeopleSuggestions?: boolean;
  currentUserId?: string | null;
}

export default function PostFeed({
  posts,
  activeTab,
  activeDebate = null,
  peopleSuggestions = [],
  peopleSuggestionReason = "Suggested for you",
  prioritizePeopleSuggestions = false,
  currentUserId = null,
}: PostFeedProps) {
  const topicPosts = posts.filter((post) => (post.tags ?? []).length > 0);
  const canShowDebateInterlude = activeTab === "home" || activeTab === "latest";

  return (
    <div>
      {posts.length === 0 ? (
        activeTab === "following" ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-500">
              You&apos;re not following anyone yet.
            </p>
            <Link
              href="/onboarding?step=follow"
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
            >
              Find writers to follow
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
            <p className="mb-1 text-lg font-medium text-gray-900">
              No posts match this view yet.
            </p>
            <p className="text-sm text-gray-500">
              Try the latest feed or start the first quick take in this space.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/?tab=latest"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-canvas"
              >
                View latest
              </Link>
              <Link
                href="/write?type=blog&starter=1"
                className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                Write a quick take
              </Link>
            </div>
          </div>
        )
      ) : (
        <div>
          {prioritizePeopleSuggestions && peopleSuggestions.length > 0 ? (
            <PeopleInterlude
              people={peopleSuggestions}
              reason={peopleSuggestionReason}
              currentUserId={currentUserId}
            />
          ) : null}

          <div className="mb-3.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
            Latest in your feed
            <span className="h-px flex-1 bg-gray-200" aria-hidden="true" />
          </div>

          {posts.map((post, index) => (
            <div key={post.id}>
              <PostCard post={post} variant="standard" />

              {canShowDebateInterlude &&
              (index + 1) % 8 === 0 &&
              activeDebate ? (
                <DebateInterlude debate={activeDebate} />
              ) : null}
              {!prioritizePeopleSuggestions && index === 11 && peopleSuggestions.length > 0 ? (
                <PeopleInterlude
                  people={peopleSuggestions}
                  reason={peopleSuggestionReason}
                  currentUserId={currentUserId}
                />
              ) : null}
              {index === 17 && topicPosts.length > 1 ? (
                <TopicInterlude posts={topicPosts} />
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
