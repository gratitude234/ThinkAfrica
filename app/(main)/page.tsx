import { createClient } from "@/lib/supabase/server";
import PostFeed from "@/components/post/PostFeed";
import type { PostCardData } from "@/components/post/PostCard";

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();

  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, excerpt, type, tags, created_at, published_at,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url)
    `
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  // Fetch like counts for each post
  const postIds = posts?.map((p) => p.id) ?? [];
  let likeCounts: Record<string, number> = {};
  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("likes")
      .select("post_id")
      .in("post_id", postIds);

    if (likes) {
      likeCounts = likes.reduce(
        (acc, like) => {
          acc[like.post_id] = (acc[like.post_id] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }
  }

  const feedPosts: PostCardData[] = (posts ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
    like_count: likeCounts[post.id] ?? 0,
  }));

  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Ideas from across Africa
        </h1>
        <p className="text-gray-500">
          Research, essays, and policy briefs from African university students.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          Failed to load posts. Please try again.
        </div>
      )}

      <PostFeed posts={feedPosts} />
    </div>
  );
}
