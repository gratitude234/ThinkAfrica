import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostCard from "@/components/post/PostCard";
import type { PostCardData } from "@/components/post/PostCard";

export default async function BookmarksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/bookmarks");

  const { data: bookmarksRaw } = await supabase
    .from("bookmarks")
    .select(
      `
      post_id,
      posts!bookmarks_post_id_fkey (
        id, title, slug, excerpt, type, tags, created_at, published_at, view_count, cover_image_url,
        profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)
      )
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const posts: PostCardData[] = (bookmarksRaw ?? [])
    .map((b) => {
      const post = Array.isArray(b.posts) ? b.posts[0] : b.posts;
      if (!post) return null;
      return {
        ...post,
        profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
      } as PostCardData;
    })
    .filter(Boolean) as PostCardData[];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Bookmarks</h1>
        <p className="text-gray-500 text-sm mt-1">
          Posts you&apos;ve saved for later.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <svg
            className="w-12 h-12 text-gray-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
          <p className="text-gray-500 font-medium">No bookmarks yet</p>
          <p className="text-gray-400 text-sm mt-1">
            Your saved posts will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
