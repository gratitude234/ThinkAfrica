import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dashboardRepository } from "@/lib/db/readAdapter";
import StatsBar from "./StatsBar";
import PostsTable from "./PostsTable";
import type { DashboardPost } from "./PostsTable";
import CreateTrigger from "@/app/(main)/CreateTrigger";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";

/**
 * The writer's dashboard: drafts, published work, and a few plain numbers.
 *
 * The publishing reset (Phase 2F) removed what used to sit around those: the
 * This Week retention card, the action inbox, the portfolio progress card and
 * its next-action recommendation, the quality checklist, the source-backed and
 * impression counts, and the private liked-posts history. Notifications live
 * in Notifications, and editing a profile is the owner's to start.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/dashboard");

  // Every read on this page goes through the repository, which decides the
  // backend. The viewer is user.id throughout and is never taken from the
  // request: these tables are readable only by their owner, and that rule
  // lives in the SQL rather than in a policy.
  const repository = dashboardRepository(supabase as never);

  const postsRaw = await repository.myPosts(user.id);
  const postIds = postsRaw.map((p) => p.id);
  const { likeCounts } =
    postIds.length > 0
      ? await repository.postStats(postIds, user.id)
      : { likeCounts: {} as Record<string, number> };

  const posts: DashboardPost[] = postsRaw.map((p) => ({
    ...p,
    impression_count: p.impression_count ?? 0,
    view_count: p.view_count ?? 0,
    read_count: p.read_count ?? 0,
    like_count: likeCounts[p.id] ?? 0,
    co_authors: (p.post_authors ?? [])
      .filter((row) => row.accepted_at)
      .filter((row) => row.user_id !== user.id)
      .map((row) => ({
        user_id: row.user_id,
        profile: row.profile as { username: string; full_name: string | null } | null,
      })),
  }));

  const publishedPosts = posts.filter((p) => p.status === "published");
  const draftCount = posts.filter((p) => p.status === "draft").length;
  const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0);
  const totalLikes = publishedPosts.reduce((sum, p) => sum + p.like_count, 0);

  return (
    <div className="max-w-5xl mx-auto">
      <RetentionEventTracker
        event="dashboard_viewed"
        metadata={{ publishedCount: publishedPosts.length }}
      />

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">
            Your drafts and published work.
          </p>
        </div>
        <CreateTrigger
          userId={user.id}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          + New
        </CreateTrigger>
      </div>

      <StatsBar
        publishedCount={publishedPosts.length}
        draftCount={draftCount}
        totalViews={totalViews}
        totalLikes={totalLikes}
      />

      <PostsTable posts={posts} userId={user.id} />
    </div>
  );
}
