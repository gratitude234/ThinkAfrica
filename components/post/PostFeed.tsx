import PostCard, { PostCardData } from "./PostCard";
import DebateInterlude, { type DebateInterludeData } from "./DebateInterlude";
import PeopleInterlude from "./PeopleInterlude";
import TopicInterlude from "./TopicInterlude";

interface PostFeedProps {
  posts: PostCardData[];
  activeDebate?: DebateInterludeData | null;
  peopleSuggestions?: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
  }[];
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
  activeDebate = null,
  peopleSuggestions = [],
  currentUserId = null,
}: PostFeedProps) {
  const featuredPostId = getFeaturedPostId(posts);
  const topicPosts = posts.filter((post) => (post.tags ?? []).length > 0);

  return (
    <div>
      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-1">No posts yet</p>
          <p className="text-sm">There’s nothing here yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <div key={post.id} className="space-y-4">
              <PostCard
                post={post}
                variant={post.id === featuredPostId ? "featured" : "standard"}
              />

              {index === 5 && activeDebate ? (
                <DebateInterlude debate={activeDebate} />
              ) : null}
              {index === 11 && peopleSuggestions.length > 0 ? (
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
