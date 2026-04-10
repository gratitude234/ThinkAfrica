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

      {applications.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Fellowship Applications
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
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
                    <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        {app.fellowship ? (
                          <Link
                            href={`/fellowships/${app.fellowship.id}`}
                            className="font-medium text-gray-900 hover:text-emerald-brand transition-colors"
                          >
                            {app.fellowship.title}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
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
                            "bg-gray-50 text-gray-600 border-gray-200"
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
