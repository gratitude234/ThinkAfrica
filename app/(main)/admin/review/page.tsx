// -- Run in Supabase: ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS featured boolean default false;

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { formatDate } from "@/lib/utils";
import ReviewActions from "./ReviewActions";
import FeaturePolicyButton from "@/app/(main)/policy/FeaturePolicyButton";
import FeaturePostButton from "./FeaturePostButton";

export default async function AdminReviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const { data: pendingPosts } = await supabase
    .from("posts")
    .select(
      `
      id, title, excerpt, type, tags, created_at,
      profiles!posts_author_id_fkey (username, full_name, university)
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  const posts = (pendingPosts ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const { data: publishedPostsRaw } = await supabase
    .from("posts")
    .select(
      `id, title, excerpt, type, featured, created_at,
      profiles!posts_author_id_fkey (full_name, university)`
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(20);

  const publishedPosts = (publishedPostsRaw ?? []).map((post) => ({
    ...post,
    featured: (post as { featured?: boolean }).featured ?? false,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const { data: featuredIds } = await supabase
    .from("policy_briefs_featured")
    .select("post_id");
  const alreadyFeatured = new Set((featuredIds ?? []).map((item) => item.post_id));

  const { data: policyBriefsRaw } = await supabase
    .from("posts")
    .select(
      "id, title, excerpt, tags, created_at, profiles!posts_author_id_fkey (full_name, university)"
    )
    .eq("status", "published")
    .eq("type", "policy_brief")
    .order("created_at", { ascending: false });

  const policyBriefs = (policyBriefsRaw ?? [])
    .filter((post) => !alreadyFeatured.has(post.id))
    .map((post) => ({
      ...post,
      profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
    }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Moderation Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Research papers and policy briefs submitted for review before publication.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg font-medium">No posts pending review.</p>
          <p className="mt-1 text-sm text-gray-400">
            Research and policy brief submissions appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="rounded-xl border border-gray-200 bg-white p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge type={post.type} />
                    {post.tags?.slice(0, 3).map((tag: string) => (
                      <Tag key={tag} label={tag} />
                    ))}
                  </div>

                  <h2 className="mb-1 text-base font-semibold text-gray-900">
                    {post.title}
                  </h2>

                  {post.excerpt && (
                    <p className="mb-3 line-clamp-2 text-sm text-gray-500">
                      {post.excerpt}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    <span>
                      By{" "}
                      <span className="font-medium text-gray-600">
                        {post.profiles?.full_name}
                      </span>{" "}
                      · {post.profiles?.university}
                    </span>
                    <span>·</span>
                    <span>Submitted {formatDate(post.created_at)}</span>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <ReviewActions postId={post.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {policyBriefs.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Policy Briefs — Feature for Institutions
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {policyBriefs.length} published brief
              {policyBriefs.length !== 1 ? "s" : ""} available to feature
            </p>
          </div>
          <div className="space-y-3">
            {policyBriefs.map((post) => (
              <div
                key={post.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {post.tags?.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} label={tag} />
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {post.excerpt}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      By {post.profiles?.full_name} · {post.profiles?.university}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <FeaturePolicyButton postId={post.id} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {publishedPosts.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Feature a Post</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              One post can be featured on the home feed at a time. Only one is
              active.
            </p>
          </div>
          <div className="space-y-3">
            {publishedPosts.map((post) => (
              <div
                key={post.id}
                className={`rounded-xl border bg-white p-5 ${
                  post.featured
                    ? "border-amber-300 bg-amber-50/40"
                    : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge type={post.type} />
                      {post.featured && (
                        <span className="text-xs font-medium text-amber-600">
                          ★ Currently featured
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {post.excerpt}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400">
                      By {post.profiles?.full_name} · {post.profiles?.university}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <FeaturePostButton
                      postId={post.id}
                      initialFeatured={post.featured}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
