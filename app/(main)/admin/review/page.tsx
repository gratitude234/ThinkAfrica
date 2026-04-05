import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { formatDate } from "@/lib/utils";
import ReviewActions from "./ReviewActions";
import FeaturePolicyButton from "@/app/(main)/policy/FeaturePolicyButton";

export default async function AdminReviewPage() {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  // Fetch pending posts
  const { data: pendingPosts } = await supabase
    .from("posts")
    .select(
      `
      id, title, excerpt, type, tags, created_at,
      profiles!posts_author_id_fkey (username, full_name, university)
    `
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const posts = (pendingPosts ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  // Fetch published policy briefs not yet featured
  const { data: featuredIds } = await supabase
    .from("policy_briefs_featured")
    .select("post_id");
  const alreadyFeatured = new Set((featuredIds ?? []).map((f) => f.post_id));

  const { data: policyBriefsRaw } = await supabase
    .from("posts")
    .select(`id, title, excerpt, tags, created_at, profiles!posts_author_id_fkey (full_name, university)`)
    .eq("status", "published")
    .eq("type", "policy_brief")
    .order("created_at", { ascending: false });

  const policyBriefs = (policyBriefsRaw ?? [])
    .filter((p) => !alreadyFeatured.has(p.id))
    .map((p) => ({
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
    }));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Editorial Review Queue</h1>
        <p className="text-gray-500 text-sm mt-1">
          {posts.length} post{posts.length !== 1 ? "s" : ""} pending review
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">All clear!</p>
          <p className="text-sm">No posts pending review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-white rounded-xl border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Type & tags */}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge type={post.type} />
                    {post.tags &&
                      post.tags.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} label={tag} />
                      ))}
                  </div>

                  {/* Title */}
                  <h2 className="text-base font-semibold text-gray-900 mb-1">
                    {post.title}
                  </h2>

                  {/* Excerpt */}
                  {post.excerpt && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                      {post.excerpt}
                    </p>
                  )}

                  {/* Author & date */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
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

                {/* Actions */}
                <div className="flex-shrink-0">
                  <ReviewActions postId={post.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Policy briefs available to feature */}
      {policyBriefs.length > 0 && (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Policy Briefs — Feature for Institutions</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {policyBriefs.length} published brief{policyBriefs.length !== 1 ? "s" : ""} available to feature
            </p>
          </div>
          <div className="space-y-3">
            {policyBriefs.map((post) => (
              <div key={post.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {post.tags?.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} label={tag} />
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{post.title}</h3>
                    {post.excerpt && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{post.excerpt}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
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
    </div>
  );
}
