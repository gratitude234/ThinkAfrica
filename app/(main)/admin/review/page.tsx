import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Tag from "@/components/ui/Tag";
import { formatDate } from "@/lib/utils";
import ReviewActions from "./ReviewActions";
import FeaturePolicyButton from "@/app/(main)/policy/FeaturePolicyButton";
import FeaturePostButton from "./FeaturePostButton";
import AssignReviewers from "./AssignReviewers";
import { requiresEditorialWorkflow } from "@/lib/reviewWorkflow";

type ReviewerAssignment = {
  post_id: string;
  reviewer_id: string;
  submitted_at: string | null;
  recommendation: string | null;
  notes: string | null;
  round: number;
  reviewer: {
    id: string;
    username: string;
    full_name: string | null;
  } | null;
};

function getBlockingReason(
  requiresReview: boolean,
  minReviewers: number,
  assignments: ReviewerAssignment[]
) {
  if (!requiresReview) {
    return null;
  }

  if (assignments.length < minReviewers) {
    return `Assign at least ${minReviewers} reviewer${minReviewers === 1 ? "" : "s"} before making a decision.`;
  }

  if (assignments.some((assignment) => !assignment.submitted_at || !assignment.recommendation)) {
    return "Wait for every assigned reviewer to submit a recommendation.";
  }

  return null;
}

function getReviewSummary(assignments: ReviewerAssignment[]) {
  const completed = assignments.filter((assignment) => assignment.submitted_at && assignment.recommendation);
  if (completed.length === 0) {
    return null;
  }

  const counts = completed.reduce(
    (acc, assignment) => {
      const key = assignment.recommendation as "accept" | "revise" | "reject";
      acc[key] += 1;
      return acc;
    },
    { accept: 0, revise: 0, reject: 0 }
  );

  return `Accept ${counts.accept} · Revise ${counts.revise} · Reject ${counts.reject}`;
}

export default async function AdminReviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAllowed =
    (adminEmail && user.email === adminEmail) ||
    currentProfile?.role === "editor" ||
    currentProfile?.role === "admin";

  if (!isAllowed) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-gray-500">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  const [
    { data: pendingPostsRaw },
    { data: publishedPostsRaw },
    { data: featuredIdsRaw },
    { data: tracksRaw },
    { data: reviewersRaw },
    { data: reviewsRaw },
    { data: decisionsRaw },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        `
        id, title, excerpt, type, status, tags, created_at, author_id, current_round,
        profiles!posts_author_id_fkey (username, full_name, university)
      `
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("posts")
      .select(
        `id, title, excerpt, type, featured, created_at,
        profiles!posts_author_id_fkey (full_name, university)`
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(20),
    supabase.from("policy_briefs_featured").select("post_id"),
    supabase.from("submission_tracks").select("*"),
    supabase
      .from("profiles")
      .select("id, username, full_name, role")
      .in("role", ["reviewer", "editor", "admin"]),
    supabase
      .from("post_reviews")
      .select(
        "post_id, reviewer_id, submitted_at, recommendation, notes, round, reviewer:profiles!post_reviews_reviewer_id_fkey(id, username, full_name)"
      )
      .order("assigned_at", { ascending: true }),
    supabase
      .from("post_editor_decisions")
      .select(
        "post_id, round, decision, notes, created_at, editor:profiles!post_editor_decisions_editor_id_fkey(username, full_name)"
      )
      .order("created_at", { ascending: false }),
  ]);

  const posts = (pendingPostsRaw ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const tracks = new Map((tracksRaw ?? []).map((track) => [track.post_type, track]));
  const groupedPosts = posts.reduce(
    (acc, post) => {
      const group = acc.get(post.type) ?? [];
      group.push(post);
      acc.set(post.type, group);
      return acc;
    },
    new Map<string, typeof posts>()
  );

  const publishedPosts = (publishedPostsRaw ?? []).map((post) => ({
    ...post,
    featured: (post as { featured?: boolean }).featured ?? false,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const alreadyFeatured = new Set((featuredIdsRaw ?? []).map((item) => item.post_id));

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
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Editorial Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track reviewed submissions from assignment through final editor decision.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <p className="text-lg font-medium">No submissions waiting in the editorial queue.</p>
          <p className="mt-1 text-sm text-gray-400">
            Research and policy briefs will appear here once submitted.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(groupedPosts.entries()).map(([type, typePosts]) => {
            const track = tracks.get(type);

            return (
              <section key={type} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold capitalize text-gray-900">
                    {type.replace("_", " ")}
                  </h2>
                  {track?.description ? (
                    <p className="mt-1 text-sm text-gray-500">{track.description}</p>
                  ) : null}
                </div>

                {typePosts.map((post) => {
                  const currentRound = post.current_round ?? 1;
                  const assignments = ((reviewsRaw ?? []) as unknown as ReviewerAssignment[])
                    .filter(
                      (review) => review.post_id === post.id && review.round === currentRound
                    )
                    .map((review) => ({
                      ...review,
                      reviewer: Array.isArray(review.reviewer)
                        ? review.reviewer[0]
                        : review.reviewer,
                    }));

                  const latestDecision = (decisionsRaw ?? []).find(
                    (decision) =>
                      decision.post_id === post.id && decision.round < currentRound
                  );

                  const availableReviewers = ((reviewersRaw ?? []) as Array<{
                    id: string;
                    username: string;
                    full_name: string | null;
                  }>).filter((reviewer) => reviewer.id !== post.author_id);

                  const reviewSummary = getReviewSummary(assignments);
                  const blockingReason = getBlockingReason(
                    Boolean(track?.requires_review),
                    track?.min_reviewers ?? 0,
                    assignments
                  );
                  const readyForDecision = !blockingReason;

                  return (
                    <div
                      key={post.id}
                      className="rounded-xl border border-gray-200 bg-white p-6"
                    >
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-4">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <Badge type={post.type} />
                              {requiresEditorialWorkflow(post.type) ? (
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
                                  Editorial workflow required
                                </span>
                              ) : null}
                              {post.tags?.slice(0, 3).map((tag: string) => (
                                <Tag key={tag} label={tag} />
                              ))}
                            </div>

                            <h3 className="text-base font-semibold text-gray-900">{post.title}</h3>
                            {post.excerpt ? (
                              <p className="mt-2 line-clamp-2 text-sm text-gray-500">
                                {post.excerpt}
                              </p>
                            ) : null}
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                              <span>
                                By{" "}
                                <span className="font-medium text-gray-600">
                                  {post.profiles?.full_name}
                                </span>{" "}
                                · {post.profiles?.university}
                              </span>
                              <span>·</span>
                              <span>Submitted {formatDate(post.created_at)}</span>
                              <span>·</span>
                              <span>Round {currentRound}</span>
                              {track?.requires_review ? (
                                <>
                                  <span>·</span>
                                  <span>
                                    {assignments.filter((assignment) => assignment.submitted_at).length}/
                                    {track.min_reviewers} required reviews complete
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          {latestDecision ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                Previous round decision
                              </p>
                              <p className="mt-1 text-sm font-medium text-gray-900">
                                Round {latestDecision.round}: {latestDecision.decision.replace("_", " ")}
                              </p>
                              {latestDecision.notes ? (
                                <p className="mt-1 text-sm text-gray-600">{latestDecision.notes}</p>
                              ) : null}
                            </div>
                          ) : null}

                          {assignments.some((assignment) => assignment.notes) ? (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                Current round reviewer notes
                              </p>
                              {assignments
                                .filter((assignment) => assignment.notes)
                                .map((assignment) => (
                                  <div
                                    key={`${assignment.reviewer_id}-${assignment.round}`}
                                    className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-sm font-medium text-gray-900">
                                        {assignment.reviewer?.full_name ??
                                          assignment.reviewer?.username ??
                                          "Reviewer"}
                                      </span>
                                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                        {assignment.recommendation ?? "Awaiting"}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                                      {assignment.notes}
                                    </p>
                                  </div>
                                ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="w-full space-y-3 lg:w-[360px]">
                          {track?.requires_review ? (
                            <AssignReviewers
                              postId={post.id}
                              round={currentRound}
                              minReviewers={track.min_reviewers}
                              reviewers={availableReviewers}
                              assignments={assignments}
                            />
                          ) : null}

                          <ReviewActions
                            postId={post.id}
                            requiresEditorialWorkflow={Boolean(track?.requires_review)}
                            readyForDecision={readyForDecision}
                            blockingReason={blockingReason}
                            currentRound={currentRound}
                            reviewSummary={reviewSummary}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {policyBriefs.length > 0 ? (
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
              <div key={post.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      {post.tags?.slice(0, 3).map((tag: string) => (
                        <Tag key={tag} label={tag} />
                      ))}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{post.title}</h3>
                    {post.excerpt ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {post.excerpt}
                      </p>
                    ) : null}
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
      ) : null}

      {publishedPosts.length > 0 ? (
        <div className="mt-12">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">Feature a Post</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              One post can be featured on the home feed at a time. Only one is active.
            </p>
          </div>
          <div className="space-y-3">
            {publishedPosts.map((post) => (
              <div
                key={post.id}
                className={`rounded-xl border bg-white p-5 ${
                  post.featured ? "border-amber-300 bg-amber-50/40" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge type={post.type} />
                      {post.featured ? (
                        <span className="text-xs font-medium text-amber-600">
                          ★ Currently featured
                        </span>
                      ) : null}
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900">{post.title}</h3>
                    {post.excerpt ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {post.excerpt}
                      </p>
                    ) : null}
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
      ) : null}
    </div>
  );
}
