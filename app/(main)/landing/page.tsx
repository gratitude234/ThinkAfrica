import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostCard from "@/components/post/PostCard";
import type { PostCardData } from "@/components/post/PostCard";

export default async function LandingPage() {
  const supabase = await createClient();

  const { data: samplePostsRaw } = await supabase
    .from("posts")
    .select(
      `id, title, slug, excerpt, type, tags, created_at, published_at, view_count,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url)`
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(3);

  const samplePosts: PostCardData[] = (samplePostsRaw ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  return (
    <div>
      {/* Hero */}
      <section className="text-center py-20 px-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Africa&apos;s Intellectual Social Network
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
          Publish research, debate ideas, and build your academic profile —
          built for African university students.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/signup"
            className="px-6 py-3 bg-emerald-brand text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors text-base"
          >
            Start Writing
          </Link>
          <Link
            href="/?guest=1"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-base"
          >
            Explore the Feed
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="py-12 bg-white rounded-2xl border border-gray-200 mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 px-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              ✍️
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Publish</h3>
            <p className="text-sm text-gray-500">
              Share blogs, essays, research papers, and policy briefs with
              Africa&apos;s academic community.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              ⚡
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Debate</h3>
            <p className="text-sm text-gray-500">
              Engage in structured intellectual debates on the most pressing
              issues facing Africa today.
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              🏆
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Grow</h3>
            <p className="text-sm text-gray-500">
              Climb the leaderboard, earn badges, and unlock fellowships as you
              contribute to the community.
            </p>
          </div>
        </div>
      </section>

      {/* Sample Posts */}
      {samplePosts.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
            Latest from the Community
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {samplePosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* Footer CTA strip */}
      <section className="bg-emerald-brand rounded-2xl p-10 text-center text-white mb-8">
        <p className="text-xl font-semibold mb-6">
          Join thousands of African students already thinking out loud.
        </p>
        <Link
          href="/signup"
          className="inline-block px-6 py-3 bg-white text-emerald-700 rounded-lg font-medium hover:bg-emerald-50 transition-colors"
        >
          Join ThinkAfrica Free
        </Link>
      </section>
    </div>
  );
}
