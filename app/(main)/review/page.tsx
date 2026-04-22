import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReview } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

export default async function ReviewerQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !canReview(profile.role)) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center text-gray-500">
        You do not have access to the reviewer portal.
      </div>
    );
  }

  const { data: assignments } = await supabase
    .from("post_reviews")
    .select(
      "post_id, round, assigned_at, posts!post_reviews_post_id_fkey(id, slug, title, excerpt, type)"
    )
    .eq("reviewer_id", user.id)
    .is("recommendation", null)
    .order("assigned_at", { ascending: false });

  const rows = (assignments ?? []).map((assignment) => ({
    ...assignment,
    post: Array.isArray(assignment.posts) ? assignment.posts[0] : assignment.posts,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reviewer Portal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Open assignments waiting for your recommendation.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-500">
          No reviews assigned right now.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((assignment) => (
            <Link
              key={`${assignment.post_id}-${assignment.round}`}
              href={`/review/${assignment.post_id}`}
              className="block rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">
                    Round {assignment.round}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-gray-900">
                    {assignment.post?.title}
                  </h2>
                  {assignment.post?.excerpt ? (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                      {assignment.post.excerpt}
                    </p>
                  ) : null}
                </div>
                <span className="text-xs text-gray-400">
                  Assigned {formatDate(assignment.assigned_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
