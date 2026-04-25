import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatsBar from "./StatsBar";
import PostsTable from "./PostsTable";
import type { DashboardPost } from "./PostsTable";
import QualitySignals, { type DashboardQualityItem } from "./QualitySignals";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import RetentionThisWeek from "@/components/retention/RetentionThisWeek";
import Button from "@/components/ui/Button";
import ActivationChecklist from "@/components/ui/ActivationChecklist";
import { getActivationState } from "@/lib/activation";
import { getRetentionSummary } from "@/lib/retention";
import { getPostQualitySummary } from "@/lib/postQuality";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  // Fetch all posts by this user
  const { data: postsRaw } = await supabase
    .from("posts")
    .select(
      `
      id, title, slug, content, excerpt, tags, type, status, view_count,
      created_at, published_at, revision_due_at, citation_id, in_response_to,
      post_reviews(assigned_at, submitted_at, recommendation),
      post_editor_decisions(decision, created_at)
      `
    )
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

  let referenceCounts: Record<string, number> = {};
  let commentCounts: Record<string, number> = {};
  let bookmarkCounts: Record<string, number> = {};
  let responseCounts: Record<string, number> = {};

  if (postIds.length > 0) {
    const [
      { data: references },
      { data: comments },
      { data: bookmarks },
      { data: responses },
    ] = await Promise.all([
      supabase.from("post_references").select("post_id").in("post_id", postIds),
      supabase.from("comments").select("post_id").in("post_id", postIds),
      supabase.from("bookmarks").select("post_id").in("post_id", postIds),
      supabase
        .from("posts")
        .select("in_response_to")
        .eq("status", "published")
        .in("in_response_to", postIds),
    ]);

    referenceCounts = ((references ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    commentCounts = ((comments ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    bookmarkCounts = ((bookmarks ?? []) as Array<{ post_id: string | null }>).reduce(
      (acc, row) => {
        if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    responseCounts = (
      (responses ?? []) as Array<{ in_response_to: string | null }>
    ).reduce(
      (acc, row) => {
        if (row.in_response_to) {
          acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );
  }

  // Follower count
  const { count: followerCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", user.id);

  const { data: authorProfile } = await supabase
    .from("profiles")
    .select("username, full_name, university, field_of_study, verified, verified_type")
    .eq("id", user.id)
    .single();

  const activationState = await getActivationState(supabase, user.id);
  const retentionSummary = await getRetentionSummary(
    supabase,
    user.id,
    activationState
  );

  // Fellowship applications by this user
  const { data: applicationsRaw } = await supabase
    .from("fellowship_applications")
    .select(
      "id, status, created_at, fellowships(id, title, deadline)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const applications = (applicationsRaw ?? []).map((a) => ({
    ...a,
    fellowship: Array.isArray(a.fellowships) ? a.fellowships[0] : a.fellowships,
  }));

  const pendingQueue = [...(postsRaw ?? [])]
    .filter((post) => post.status === "pending")
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
  const queuePositionById = new Map(
    pendingQueue.map((post, index) => [post.id, index + 1])
  );

  const posts: DashboardPost[] = (postsRaw ?? []).map((p) => ({
    ...p,
    view_count: p.view_count ?? 0,
    like_count: likeCounts[p.id] ?? 0,
    revision_due_at: p.revision_due_at ?? null,
    citation_id: (p as { citation_id?: string | null }).citation_id ?? null,
    post_reviews: p.post_reviews ?? [],
    post_editor_decisions: p.post_editor_decisions ?? [],
    queuePosition: queuePositionById.get(p.id) ?? null,
  }));

  const qualityItems: DashboardQualityItem[] = (postsRaw ?? [])
    .map((post) => {
      const reviews = post.post_reviews ?? [];
      const summary = getPostQualitySummary({
        type: post.type,
        status: post.status,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        tags: post.tags ?? [],
        citationId: (post as { citation_id?: string | null }).citation_id ?? null,
        isResponse: Boolean(
          (post as { in_response_to?: string | null }).in_response_to
        ),
        author: authorProfile,
        referenceCount: referenceCounts[post.id] ?? 0,
        responseCount: responseCounts[post.id] ?? 0,
        reviewCount: reviews.length,
        completedReviewCount: reviews.filter((review) => review.submitted_at).length,
        commentCount: commentCounts[post.id] ?? 0,
        likeCount: likeCounts[post.id] ?? 0,
        bookmarkCount: bookmarkCounts[post.id] ?? 0,
      });

      return {
        id: post.id,
        title: post.title,
        status: post.status,
        actionHref:
          post.status === "draft" ? `/write?draft=${post.id}` : `/edit/${post.slug}`,
        actionLabel:
          post.status === "pending_revision"
            ? "Review notes"
            : post.status === "draft"
              ? "Continue"
              : "Improve",
        summary,
      };
    })
    .filter(
      (item) =>
        item.status === "pending_revision" ||
        item.status === "draft" ||
        item.summary.missingItems.length > 0 ||
        item.summary.wordCount > 0
    )
    .sort((left, right) => {
      const priority = (item: DashboardQualityItem) => {
        if (item.status === "pending_revision") return 0;
        if (!item.summary.readyForSubmission) return 1;
        if (item.status === "draft") return 2;
        return 3;
      };

      return priority(left) - priority(right);
    })
    .slice(0, 4);

  const revisionPosts = posts.filter((post) => post.status === "pending_revision");
  const publishedPosts = posts.filter((p) => p.status === "published");
  const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0);
  const totalLikes = publishedPosts.reduce((sum, p) => sum + p.like_count, 0);
  return (
    <div className="max-w-5xl mx-auto">
      <RetentionEventTracker
        event="dashboard_viewed"
        metadata={{
          activated: activationState.activated,
          publishedCount: publishedPosts.length,
        }}
      />

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

      {activationState.activated ? (
        <RetentionThisWeek summary={retentionSummary} source="dashboard" />
      ) : (
        <ActivationChecklist state={activationState} />
      )}

      {revisionPosts.length > 0 ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Reviewer feedback received
          </h2>
          <div className="mt-3 space-y-2">
            {revisionPosts.map((post) => (
              <Link
                key={post.id}
                href={`/edit/${post.slug}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:bg-amber-100/40"
              >
                <span className="font-medium text-gray-900">{post.title}</span>
                <span className="text-right text-xs font-medium text-amber-700">
                  {post.revision_due_at
                    ? `Revise by ${new Date(post.revision_due_at).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }
                      )}`
                    : "Revise now"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <QualitySignals items={qualityItems} />

      <StatsBar
        totalViews={totalViews}
        totalLikes={totalLikes}
        publishedCount={publishedPosts.length}
        followerCount={followerCount ?? 0}
      />

      <PostsTable posts={posts} userId={user.id} />

      {applications.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Fellowship Applications
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-canvas">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Fellowship
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Applied
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map((app) => {
                  const statusStyles: Record<string, string> = {
                    pending: "bg-amber-50 text-amber-700 border-amber-200",
                    shortlisted: "bg-blue-50 text-blue-700 border-blue-200",
                    accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    rejected: "bg-red-50 text-red-600 border-red-200",
                  };
                  return (
                    <tr key={app.id} className="hover:bg-canvas transition-colors">
                      <td className="px-4 py-3">
                        {app.fellowship ? (
                          <Link
                            href={`/fellowships/${app.fellowship.id}`}
                            className="font-medium text-gray-900 hover:text-emerald-brand transition-colors"
                          >
                            {app.fellowship.title}
                          </Link>
                        ) : (
                          <span className="text-gray-400">No fellowship found</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(app.created_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            statusStyles[app.status] ??
                            "bg-canvas text-gray-600 border-gray-200"
                          }`}
                        >
                          {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
