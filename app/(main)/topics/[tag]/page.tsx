import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostCard from "@/components/post/PostCard";
import Link from "next/link";

interface PageProps {
  params: Promise<{ tag: string }>;
}

export default async function TopicPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const supabase = await createClient();

  // Fetch posts with this tag
  const { data: postsRaw } = await supabase
    .from("posts")
    .select(`
      id, title, slug, excerpt, type, tags, created_at, published_at, view_count,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url)
    `)
    .eq("status", "published")
    .contains("tags", [decodedTag])
    .order("view_count", { ascending: false });

  if (!postsRaw) notFound();

  const posts = postsRaw.map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  // Top contributors for this tag
  const contributorMap = new Map<string, { full_name: string; username: string; count: number }>();
  for (const post of posts) {
    if (post.profiles) {
      const key = post.profiles.username;
      const existing = contributorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        contributorMap.set(key, {
          full_name: post.profiles.full_name,
          username: post.profiles.username,
          count: 1,
        });
      }
    }
  }
  const topContributors = Array.from(contributorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="mb-8">
        <p className="text-sm text-gray-400 mb-1">Topic</p>
        <h1 className="text-3xl font-bold text-gray-900">#{decodedTag}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {posts.length} post{posts.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Posts */}
        <div className="lg:col-span-2 space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
              <p>No posts with this tag yet.</p>
              <Link href="/write" className="text-emerald-brand text-sm mt-2 inline-block hover:underline">
                Write about {decodedTag}
              </Link>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={{
                  id: post.id,
                  title: post.title,
                  slug: post.slug,
                  excerpt: post.excerpt,
                  type: post.type,
                  tags: post.tags,
                  created_at: post.created_at,
                  published_at: post.published_at,
                  profiles: post.profiles as { username: string; full_name: string; university: string; avatar_url: string | null } | null,
                }}
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {topContributors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Top Contributors</h3>
              <div className="space-y-3">
                {topContributors.map((c, i) => (
                  <Link
                    key={c.username}
                    href={`/${c.username}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-xs text-gray-400 font-medium w-4">
                      {i + 1}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                      {c.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors truncate">
                        {c.full_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {c.count} post{c.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
