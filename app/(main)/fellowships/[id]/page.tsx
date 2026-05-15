import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getOpportunityShortLabel,
  getOpportunityStyle,
  normalizeOpportunityType,
} from "@/lib/opportunities";
import { getOpportunityMatchSummary } from "@/lib/opportunityMatch";
import { getOpportunityReadinessSummary } from "@/lib/opportunityReadiness";
import { formatDate } from "@/lib/utils";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import OpportunityReadinessCard from "@/components/opportunities/OpportunityReadinessCard";
import SaveOpportunityButton from "@/components/opportunities/SaveOpportunityButton";
import FellowshipApply from "./FellowshipApply";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FellowshipPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: fellowship } = await supabase
    .from("fellowships")
    .select("*")
    .eq("id", id)
    .single();

  if (!fellowship) notFound();
  const opportunityType = normalizeOpportunityType(fellowship.opportunity_type);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let existingApplication: { status: string } | null = null;
  let currentProfile = null;
  let currentTalentProfile = null;
  let currentPosts: Array<{
    id: string;
    title: string;
    slug: string;
    type: string;
    status: string;
    citation_id: string | null;
    tags: string[] | null;
  }> = [];
  let saved = false;
  if (user) {
    const [
      { data: applicationData },
      { data: profileData },
      { data: talentData },
      { data: postsData },
      { data: savedData },
    ] = await Promise.all([
      supabase
        .from("fellowship_applications")
        .select("status")
        .eq("fellowship_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("username, full_name, country, university, field_of_study, bio, interests")
        .eq("id", user.id)
        .single(),
      supabase
        .from("talent_profiles")
        .select("id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("posts")
        .select("id, title, slug, type, status, citation_id, tags")
        .eq("author_id", user.id)
        .order("published_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("saved_opportunities")
        .select("id")
        .eq("fellowship_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    existingApplication = applicationData;
    currentProfile = profileData;
    currentTalentProfile = talentData;
    currentPosts = postsData ?? [];
    saved = Boolean(savedData);
  }

  const matchSummary = user
    ? getOpportunityMatchSummary({
        opportunity: fellowship,
        profile: currentProfile,
        talentProfile: currentTalentProfile,
        posts: currentPosts,
      })
    : null;
  const readiness =
    user && currentProfile
      ? getOpportunityReadinessSummary({
          profile: currentProfile,
          talentProfile: currentTalentProfile,
          posts: currentPosts,
        })
      : null;
  const proofPosts = currentPosts
    .filter((post) => post.status === "published")
    .sort((left, right) => {
      const score = (post: typeof left) =>
        (post.citation_id ? 3 : 0) +
        (post.type === "research" || post.type === "policy_brief" ? 2 : 0);
      return score(right) - score(left);
    })
    .slice(0, 8);

  const daysLeft = fellowship.deadline
    ? Math.ceil(
        (new Date(fellowship.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <RetentionEventTracker
        event="fellowship_opened"
        metadata={{
          fellowshipId: id,
          status: fellowship.status,
          opportunityType,
        }}
      />
      <RetentionEventTracker
        event="opportunity_listing_opened"
        metadata={{
          fellowshipId: id,
          status: fellowship.status,
          opportunityType,
          source: "detail",
        }}
      />
      <Link
        href="/fellowships"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Opportunities
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6">
        {/* Status */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              fellowship.status === "open"
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {fellowship.status === "open" ? "Open" : "Closed"}
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${getOpportunityStyle(
              opportunityType
            )}`}
          >
            {getOpportunityShortLabel(opportunityType)}
          </span>
          {daysLeft !== null && daysLeft >= 0 && fellowship.status === "open" && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                daysLeft <= 7
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {daysLeft === 0 ? "Closes today" : `${daysLeft} days left`}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">
            {fellowship.title}
          </h1>
          <SaveOpportunityButton
            fellowshipId={id}
            initialSaved={saved}
            userId={user?.id ?? null}
            source="fellowship_detail"
          />
        </div>

        {fellowship.sponsor_name && (
          <p className="text-sm font-medium text-emerald-600 mb-4">
            by {fellowship.sponsor_name}
          </p>
        )}

        {/* Key details */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {fellowship.amount && (
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xs text-amber-600 font-medium mb-0.5">Award</p>
              <p className="text-sm font-semibold text-gray-900">{fellowship.amount}</p>
            </div>
          )}
          {fellowship.deadline && (
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Deadline</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatDate(fellowship.deadline)}
              </p>
            </div>
          )}
          {fellowship.location && (
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-xs text-gray-500 font-medium mb-0.5">Location</p>
              <p className="text-sm font-semibold text-gray-900">
                {fellowship.location}
              </p>
            </div>
          )}
        </div>

        {fellowship.description && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              About this opportunity
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">{fellowship.description}</p>
          </div>
        )}

        {fellowship.skills?.length ? (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Useful skills
            </h2>
            <div className="flex flex-wrap gap-2">
              {fellowship.skills.map((skill: string) => (
                <span
                  key={skill}
                  className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {matchSummary ? (
          <div className="mb-6 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Match
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {matchSummary.label} / {matchSummary.score}%
                </h2>
              </div>
              {matchSummary.missing[0] ? (
                <Link
                  href={matchSummary.missing[0].actionHref}
                  className="inline-flex rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:border-emerald-300"
                >
                  {matchSummary.missing[0].label}
                </Link>
              ) : null}
            </div>
            {matchSummary.reasons.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {matchSummary.reasons.map((reason) => (
                  <span
                    key={reason.key}
                    className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-emerald-800"
                  >
                    {reason.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {readiness ? (
          <div className="mb-6">
            <OpportunityReadinessCard summary={readiness} source="opportunities" />
          </div>
        ) : null}

        {fellowship.eligibility && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">Eligibility</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{fellowship.eligibility}</p>
          </div>
        )}

        {fellowship.application_url && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">External Application</h2>
            <a
              href={fellowship.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-emerald-brand hover:underline"
            >
              {fellowship.application_url}
            </a>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100">
          <FellowshipApply
            fellowshipId={id}
            userId={user?.id ?? null}
            existingApplication={existingApplication}
            fellowshipStatus={fellowship.status}
            opportunityType={opportunityType}
            proofPosts={proofPosts}
          />
        </div>
      </div>
    </div>
  );
}
