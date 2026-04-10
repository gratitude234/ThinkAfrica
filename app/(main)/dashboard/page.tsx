import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatsBar from "./StatsBar";
import PostsTable from "./PostsTable";
import type { DashboardPost } from "./PostsTable";
import Button from "@/components/ui/Button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  // Fetch all posts by this user
  const { data: postsRaw } = await supabase
    .from("posts")
    .select("id, title, slug, type, status, view_count, created_at, published_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const postIds = (postsRaw ?? []).map((p) => p.id);

  // Fetch like counts for all posts
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

  // Follower count
  const { count: followerCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", user.id);

  const posts: DashboardPost[] = (postsRaw ?? []).map((p) => ({
    ...p,
    view_count: p.view_count ?? 0,
    like_count: likeCounts[p.id] ?? 0,
  }));

  const publishedPosts = posts.filter((p) => p.status === "published");
  const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0);
  const totalLikes = publishedPosts.reduce((sum, p) => sum + p.like_count, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage your posts and track your performance.
          </p>
        </div>
        <Link href="/write">
          <Button>+ New post</Button>
        </Link>
      </div>

      <StatsBar
        totalViews={totalViews}
        totalLikes={totalLikes}
        publishedCount={publishedPosts.length}
        followerCount={followerCount ?? 0}
      />

      <PostsTable posts={posts} />
    </div>
  );
}
