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

function getFeaturedPostId(posts: PostCardData[]) {
  if (posts.length === 0) return null;
  const scoredPosts = posts.filter(
    (post) => post.score !== undefined && post.cover_image_url
  );
  if (scoredPosts.length === 0) return null;

  const scores = [...scoredPosts]
    .map((post) => post.score ?? 0)
    .sort((left, right) => right - left);
  const cutoffIndex = Math.max(0, Math.floor(scores.length * 0.2) - 1);
  const cutoff = scores[cutoffIndex] ?? scores[0] ?? 0;

  return (
    scoredPosts.find((post, index) => index === 0 && (post.score ?? 0) >= cutoff)
      ?.id ?? null
  );
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
  const featuredPostId = getFeaturedPostId(posts);
  const topicPosts = posts.filter((post) => (post.tags ?? []).length > 0);
  const canShowDebateInterlude = activeTab === "home" || activeTab === "latest";

  return (
    <div>
      {posts.length === 0 ? (
        activeTab === "following" ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
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
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
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
        <div className="space-y-4">
          {prioritizePeopleSuggestions && peopleSuggestions.length > 0 ? (
            <PeopleInterlude
              people={peopleSuggestions}
              reason={peopleSuggestionReason}
              currentUserId={currentUserId}
            />
          ) : null}

          {posts.map((post, index) => (
            <div key={post.id} className="space-y-4">
              <PostCard
                post={post}
                variant={post.id === featuredPostId ? "featured" : "standard"}
              />

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
