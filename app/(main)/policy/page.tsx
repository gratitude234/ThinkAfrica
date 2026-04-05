import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import Tag from "@/components/ui/Tag";
import FeaturePolicyButton from "./FeaturePolicyButton";
import SponsorBanner from "@/components/ui/SponsorBanner";

export default async function PolicyHubPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = !!user && user.email === process.env.ADMIN_EMAIL;

  // Fetch featured policy briefs
  const { data: featuredRaw } = await supabase
    .from("policy_briefs_featured")
    .select(`
      id, institution_target, featured_at,
      posts!policy_briefs_featured_post_id_fkey (
        id, title, slug, excerpt, tags, view_count, published_at,
        profiles!posts_author_id_fkey (username, full_name, university)
      )
    `)
    .order("featured_at", { ascending: false });

  const featured = (featuredRaw ?? []).map((f) => ({
    ...f,
    posts: Array.isArray(f.posts) ? f.posts[0] : f.posts,
  })).filter((f) => f.posts);

  const featuredPostIds = new Set(featured.map((f) => (f.posts as { id: string }).id));

  // Fetch all published policy briefs
  const { data: allBriefsRaw } = await supabase
    .from("posts")
    .select(`
      id, title, slug, excerpt, tags, view_count, published_at,
      profiles!posts_author_id_fkey (username, full_name, university)
    `)
    .eq("status", "published")
    .eq("type", "policy_brief")
    .order("view_count", { ascending: false });

  const allBriefs = (allBriefsRaw ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  const nonFeaturedBriefs = allBriefs.filter((p) => !featuredPostIds.has(p.id));

  const { data: sponsorRaw } = await supabase
    .from("sponsor_placements")
    .select("sponsor_name, content, link_url")
    .eq("placement_type", "policy_hub")
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const sponsor = sponsorRaw ?? null;

  return (
    <div className="max-w-4xl mx-auto">
      <SponsorBanner placement={sponsor} />
      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Policy Hub</h1>
        <p className="text-gray-500 text-lg">
          Student-Generated Policy Ideas for Africa
        </p>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-amber-500">★</span> Featured by Institutions
          </h2>
          <div className="space-y-4">
            {featured.map((f) => {
              type PostShape = {
                id: string; title: string; slug: string; excerpt: string | null;
                tags: string[] | null; view_count: number; published_at: string | null;
                profiles: { username: string; full_name: string; university: string } | null;
              };
              const post = f.posts as unknown as PostShape;
              const author = post.profiles;
              return (
                <div
                  key={f.id}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      {f.institution_target && (
                        <p className="text-xs font-medium text-amber-600 mb-2">
                          Submitted to: {f.institution_target}
                        </p>
                      )}
                      <Link href={`/post/${post.slug}`}>
                        <h3 className="text-lg font-semibold text-gray-900 hover:text-emerald-brand transition-colors mb-2">
                          {post.title}
                        </h3>
                      </Link>
                      {post.excerpt && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                          {post.excerpt}
                        </p>
                      )}
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {post.tags.slice(0, 4).map((tag: string) => (
                            <Tag key={tag} label={tag} />
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-500">
                        By <span className="font-medium">{author?.full_name}</span>
                        {author?.university && ` · ${author.university}`}
                        {post.published_at && ` · ${formatDate(post.published_at)}`}
                      </p>
                    </div>
                    <div className="text-xs text-gray-400 flex-shrink-0">
                      {post.view_count} views
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* All policy briefs */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          All Policy Briefs ({allBriefs.length})
        </h2>
        {nonFeaturedBriefs.length === 0 && featured.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p>No policy briefs yet.</p>
            <Link href="/write" className="text-emerald-brand text-sm mt-2 inline-block hover:underline">
              Write a policy brief
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {nonFeaturedBriefs.map((post) => {
              const author = post.profiles;
              return (
                <div key={post.id} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <Link href={`/post/${post.slug}`}>
                        <h3 className="text-base font-semibold text-gray-900 hover:text-emerald-brand transition-colors mb-2">
                          {post.title}
                        </h3>
                      </Link>
                      {post.excerpt && (
                        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                          {post.excerpt}
                        </p>
                      )}
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {post.tags.slice(0, 4).map((tag: string) => (
                            <Tag key={tag} label={tag} />
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-gray-400">
                        By <span className="font-medium text-gray-600">{author?.full_name}</span>
                        {author?.university && ` · ${author.university}`}
                        {post.view_count > 0 && ` · ${post.view_count} views`}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex-shrink-0">
                        <FeaturePolicyButton postId={post.id} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
