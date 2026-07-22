import Link from "next/link";
import { PostCardData } from "./PostCard";
import HomeFeedCardImpression from "./HomeFeedCardImpression";
import DebateInterlude, { type DebateInterludeData } from "./DebateInterlude";
import PeopleInterlude from "./PeopleInterlude";
import TopicInterlude from "./TopicInterlude";

type FeedTabKey = "home" | "following" | "latest";
export type DiscoveryModule = "people" | "debate" | "topic";

export function getDiscoveryModuleOrder({
  prioritizePeople,
  hasPeople,
  hasDebate,
  hasTopic,
}: {
  prioritizePeople: boolean;
  hasPeople: boolean;
  hasDebate: boolean;
  hasTopic: boolean;
}): DiscoveryModule[] {
  const order: DiscoveryModule[] = prioritizePeople
    ? ["people", "debate", "topic"]
    : ["debate", "people", "topic"];

  return order.filter((module) => {
    if (module === "people") return hasPeople;
    if (module === "debate") return hasDebate;
    return hasTopic;
  });
}

export function getDiscoveryModuleAt({
  activeTab,
  completedCount,
  modules,
}: {
  activeTab: FeedTabKey;
  completedCount: number;
  modules: DiscoveryModule[];
}) {
  if (activeTab !== "home" || completedCount < 8 || completedCount % 8 !== 0) {
    return null;
  }
  return modules[completedCount / 8 - 1] ?? null;
}

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
  const discoveryModules = getDiscoveryModuleOrder({
    prioritizePeople: prioritizePeopleSuggestions,
    hasPeople: peopleSuggestions.length > 0,
    hasDebate: Boolean(activeDebate),
    hasTopic: topicPosts.length > 1,
  });

  const renderDiscoveryModule = (module: DiscoveryModule) => {
    if (module === "people") {
      return (
        <PeopleInterlude
          people={peopleSuggestions}
          reason={peopleSuggestionReason}
          currentUserId={currentUserId}
        />
      );
    }
    if (module === "debate" && activeDebate) {
      return <DebateInterlude debate={activeDebate} />;
    }
    if (module === "topic") return <TopicInterlude posts={topicPosts} />;
    return null;
  };

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
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-[#0E4B37]"
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
              Try the latest feed or share the first post in this space.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/?tab=latest"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-canvas"
              >
                View latest
              </Link>
              <Link
                href="/create/post"
                className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-[#0E4B37]"
              >
                Share a post
              </Link>
            </div>
          </div>
        )
      ) : (
        <div>
          {posts.map((post, index) => {
            const completedCount = index + 1;
            const discoveryModule = getDiscoveryModuleAt({
              activeTab,
              completedCount,
              modules: discoveryModules,
            });

            return (
              <div key={post.id}>
                <HomeFeedCardImpression
                  post={post}
                  currentUserId={currentUserId}
                  surface={activeTab}
                  priority={index === 0}
                />
                {discoveryModule ? (
                  <div className="lg:hidden">
                    {renderDiscoveryModule(discoveryModule)}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
