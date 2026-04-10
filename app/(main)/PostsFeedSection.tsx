import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import PostFeed from "@/components/post/PostFeed";
import type { PostCardData } from "@/components/post/PostCard";

interface Props {
  tab: string;
  userId: string | null;
  userInterests: string[];
  followedIds: string[];
  showForYouEligible: boolean;
  showFollowingEligible: boolean;
}

async function getLikeCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const { data } = await supabase
    .from("likes")
    .select("post_id")
    .in("post_id", postIds);
  return (data ?? []).reduce(
    (acc, like) => {
      acc[like.post_id] = (acc[like.post_id] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function mapPosts(
  raw: unknown[],
  likeCounts: Record<string, number>
): PostCardData[] {
  return (raw as Array<Record<string, unknown>>).map((post) => ({
    ...(post as object),
    profiles: Array.isArray(post.profiles)
      ? (post.profiles as unknown[])[0]
      : post.profiles,
    like_count: likeCounts[(post.id as string) ?? ""] ?? 0,
  })) as PostCardData[];
}

const POST_SELECT = `id, title, slug, excerpt, type, tags, created_at, published_at, view_count, cover_image_url,
  profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)`;

export default async function PostsFeedSection({
  tab,
  userId,
  userInterests,
  followedIds,
  showForYouEligible,
  showFollowingEligible,
}: Props) {
  const supabase = await createClient();

  // Determine which feeds are needed based on tab and eligibility
  const needsForYou = showForYouEligible;
  const needsFollowing = showFollowingEligible && followedIds.length > 0;

  // Run needed queries in parallel
  const [mainRaw, forYouRaw, followingRaw] = await Promise.all([
    supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(30)
      .then((r) => r.data ?? []),

    needsForYou
      ? supabase
          .from("posts")
          .select(POST_SELECT)
          .eq("status", "published")
          .overlaps("tags", userInterests)
          .order("published_at", { ascending: false })
          .limit(10)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),

    needsFollowing
      ? supabase
          .from("posts")
          .select(POST_SELECT)
          .eq("status", "published")
          .in("author_id", followedIds)
          .order("published_at", { ascending: false })
          .limit(20)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // Fetch all like counts in parallel
  const idSet = new Set<string>();
  for (const p of [...mainRaw, ...forYouRaw, ...followingRaw]) {
    idSet.add((p as { id: string }).id);
  }
  const allIds = Array.from(idSet);
  const likeCounts = await getLikeCounts(supabase, allIds);

  const feedPosts = mapPosts(mainRaw, likeCounts);
  const forYouPosts = mapPosts(forYouRaw, likeCounts);
  const followingPosts = mapPosts(followingRaw, likeCounts);

  const showForYouTab = showForYouEligible && forYouPosts.length > 0;
  const showFollowingTab = showFollowingEligible;
  const showTabs = showForYouTab || showFollowingTab;

  const activeTab =
    tab === "following" && showFollowingTab
      ? "following"
      : tab === "foryou" && showForYouTab
        ? "foryou"
        : "latest";

  const displayPosts =
    activeTab === "following"
      ? followingPosts
      : activeTab === "foryou"
        ? forYouPosts
        : feedPosts;

  return (
    <>
      {showTabs && (
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <Link
            href="/"
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "latest"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Latest
          </Link>
          {showFollowingTab && (
            <Link
              href="/?tab=following"
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "following"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Following
            </Link>
          )}
          {showForYouTab && (
            <Link
              href="/?tab=foryou"
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === "foryou"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              For You
            </Link>
          )}
        </div>
      )}
      <PostFeed posts={displayPosts} />
    </>
  );
}
