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
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">
              You&apos;re not following anyone yet.
            </p>
            <Link
              href="/onboarding?step=follow"
              className="mt-3 inline-block text-sm text-emerald-600 hover:underline"
            >
              Find writers to follow {"->"}
            </Link>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400">
            <p className="mb-1 text-lg font-medium">No posts yet</p>
            <p className="text-sm">There&apos;s nothing here yet.</p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {prioritizePeopleSuggestions && peopleSuggestions.length > 0 ? (
            <PeopleInterlude
              people={peopleSuggestions}
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
