import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import {
  getOpportunityShortLabel,
  getOpportunityStyle,
} from "@/lib/opportunities";
import { getApplicationReviewSummary } from "@/lib/applicationReview";
import { formatDate } from "@/lib/utils";
import FellowshipForm from "./FellowshipForm";
import ApplicationActions from "./ApplicationActions";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-600 border-amber-200",
  shortlisted: "bg-blue-50 text-blue-600 border-blue-200",
  accepted: "bg-emerald-50 text-emerald-600 border-emerald-200",
  rejected: "bg-red-50 text-red-500 border-red-200",
};

export default async function AdminFellowshipsPage() {
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    const result = await createAdminActionClient("opportunities.manage");
    supabase = result.admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
    return <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">Access denied.</div>;
  }

  const { data: fellowships } = await supabase
    .from("fellowships")
    .select("id, title, status, deadline, sponsor_name, opportunity_type, location, featured, eligibility, skills")
    .order("created_at", { ascending: false });

  const { data: applicationsRaw } = await supabase
    .from("fellowship_applications")
    .select(`
      id, status, applied_at, cover_letter, fellowship_id, user_id, proof_post_id, review_note, reviewed_at,
      profiles!fellowship_applications_user_id_fkey (id, full_name, username, bio, country, university, field_of_study, avatar_url, verified, verified_type, interests)
    `)
    .order("applied_at", { ascending: false });

  const proofPostIds = (applicationsRaw ?? [])
    .map((app) => app.proof_post_id)
    .filter(Boolean) as string[];
  const { data: proofPostsRaw } =
    proofPostIds.length > 0
      ? await supabase
          .from("posts")
          .select("id, title, slug, citation_id, type, status, post_references(id)")
          .in("id", proofPostIds)
      : { data: [] };
  const proofPosts = new Map(
    (proofPostsRaw ?? []).map((post) => [post.id, post])
  );
  const applicantIds = Array.from(
    new Set((applicationsRaw ?? []).map((app) => app.user_id).filter(Boolean))
  ) as string[];
  const [{ data: applicantPostsRaw }, { data: talentProfilesRaw }] =
    applicantIds.length > 0
      ? await Promise.all([
          supabase
            .from("posts")
            .select("id, author_id, type, status, citation_id, tags, post_references(id)")
            .in("author_id", applicantIds),
          supabase
            .from("talent_profiles")
            .select("user_id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility")
            .in("user_id", applicantIds),
        ])
      : [{ data: [] }, { data: [] }];
  const postsByApplicant = (applicantPostsRaw ?? []).reduce(
    (acc: Record<string, Array<Record<string, unknown>>>, post) => {
      const authorId = post.author_id as string;
      acc[authorId] = [...(acc[authorId] ?? []), post as Record<string, unknown>];
      return acc;
    },
    {}
  );
  const talentByApplicant = new Map(
    (talentProfilesRaw ?? []).map((profile) => [profile.user_id, profile])
  );
  const fellowshipById = new Map((fellowships ?? []).map((item) => [item.id, item]));

  const applications = (applicationsRaw ?? []).map((a) => ({
    ...a,
    profiles: Array.isArray(a.profiles) ? a.profiles[0] : a.profiles,
    proofPost: a.proof_post_id ? proofPosts.get(a.proof_post_id) ?? null : null,
  }));

  // Group by fellowship
  const appsByFellowship = applications.reduce((acc, app) => {
    if (!acc[app.fellowship_id]) acc[app.fellowship_id] = [];
    acc[app.fellowship_id].push(app);
    return acc;
  }, {} as Record<string, typeof applications>);

  const totalApps = applications.length;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Opportunities</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {(fellowships ?? []).length} opportunities / {totalApps} applications
          </p>
        </div>
        <FellowshipForm />
      </div>

      {(fellowships ?? []).length === 0 ? (
        <div className="text-center py-16 text-gray-400">No opportunities yet.</div>
      ) : (
        <div className="space-y-8">
          {(fellowships ?? []).map((fellowship) => {
            const apps = appsByFellowship[fellowship.id] ?? [];
            return (
              <div key={fellowship.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{fellowship.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fellowship.sponsor_name && `${fellowship.sponsor_name} · `}
                      {fellowship.location && `${fellowship.location} / `}
                      {fellowship.deadline ? `Deadline: ${formatDate(fellowship.deadline)}` : "No deadline"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getOpportunityStyle(fellowship.opportunity_type)}`}>
                      {getOpportunityShortLabel(fellowship.opportunity_type)}
                    </span>
                    {fellowship.featured ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-ink text-white">
                        Featured
                      </span>
                    ) : null}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border capitalize ${
                      fellowship.status === "open" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"
                    }`}>
                      {fellowship.status}
                    </span>
                    <span className="text-xs text-gray-400">{apps.length} application{apps.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>

                {apps.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-gray-400">No applications yet.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {apps.map((app) => {
                      const fellowshipDetails = fellowshipById.get(app.fellowship_id);
                      const applicantPosts = (postsByApplicant[app.user_id] ?? []).map((post) => ({
                        type: post.type as string | null,
                        status: post.status as string | null,
                        citation_id: post.citation_id as string | null,
                        tags: (post.tags as string[] | null) ?? [],
                        referenceCount: Array.isArray(post.post_references)
                          ? post.post_references.length
                          : 0,
                      }));
                      const proofPost = app.proofPost
                        ? {
                            type: app.proofPost.type,
                            status: app.proofPost.status,
                            citation_id: app.proofPost.citation_id,
                            referenceCount: Array.isArray(app.proofPost.post_references)
                              ? app.proofPost.post_references.length
                              : 0,
                          }
                        : null;
                      const reviewSummary = getApplicationReviewSummary({
                        status: app.status,
                        coverLetter: app.cover_letter,
                        profile: app.profiles,
                        talentProfile: talentByApplicant.get(app.user_id) ?? null,
                        opportunity: fellowshipDetails,
                        proofPost,
                        posts: applicantPosts,
                      });

                      return (
                      <div key={app.id} className="px-6 py-5">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {app.profiles?.username ? (
                                <Link
                                  href={`/${app.profiles.username}`}
                                  className="font-medium text-gray-900 text-sm hover:text-emerald-700"
                                >
                                  {app.profiles?.full_name ?? app.profiles.username}
                                </Link>
                              ) : (
                                <p className="font-medium text-gray-900 text-sm">
                                  {app.profiles?.full_name}
                                </p>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${STATUS_STYLES[app.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                                {reviewSummary.statusLabel}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mb-2">
                              {app.profiles?.university} · Applied {formatDate(app.applied_at)}
                            </p>
                            <div className="mb-3 flex flex-wrap gap-1.5">
                              {reviewSummary.signals.map((signal) => (
                                <span
                                  key={signal.key}
                                  className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600"
                                >
                                  {signal.label}
                                </span>
                              ))}
                            </div>
                            {app.cover_letter && (
                              <p className="text-xs text-gray-500 line-clamp-2">
                                {app.cover_letter}
                              </p>
                            )}
                            {app.proofPost ? (
                              <Link
                                href={`/post/${app.proofPost.slug}`}
                                className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                Proof: {app.proofPost.title}
                              </Link>
                            ) : null}
                            <p className="mt-2 text-xs font-medium text-gray-500">
                              Recommended action: {reviewSummary.recommendedAction}
                            </p>
                            {app.review_note ? (
                              <p className="mt-2 rounded-lg bg-canvas px-3 py-2 text-xs text-gray-600">
                                Internal note: {app.review_note}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex-shrink-0">
                            <ApplicationActions
                              applicationId={app.id}
                              currentStatus={app.status}
                              initialReviewNote={app.review_note}
                            />
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
