import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getOpportunityShortLabel,
  getOpportunityStyle,
  isOpportunityType,
  normalizeOpportunityType,
  OPPORTUNITY_LABELS,
  OPPORTUNITY_TYPES,
} from "@/lib/opportunities";
import { getOpportunityReadinessSummary } from "@/lib/opportunityReadiness";
import OpportunityProfileEditor from "@/components/opportunities/OpportunityProfileEditor";
import OpportunityReadinessCard from "@/components/opportunities/OpportunityReadinessCard";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import UserAvatar from "@/components/ui/UserAvatar";

interface PageProps {
  searchParams: Promise<{
    type?: string;
    university?: string;
    skill?: string;
  }>;
}

interface OpportunityProfileSummary {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface TalentProfileRow {
  id: string;
  open_to_opportunities: boolean;
  opportunity_types: string[] | null;
  skills: string[] | null;
  visibility: string;
  updated_at: string;
  profiles: OpportunityProfileSummary | OpportunityProfileSummary[] | null;
}

interface CuratedOpportunity {
  id: string;
  title: string;
  sponsor_name: string | null;
  amount: string | null;
  eligibility: string | null;
  deadline: string | null;
  status: string;
  opportunity_type: string | null;
  skills: string[] | null;
  location: string | null;
  featured: boolean | null;
}

interface ApplicationSummary {
  fellowship_id: string;
  status: string;
}

function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function filterTalent(
  talents: Array<TalentProfileRow & { profile: OpportunityProfileSummary | null }>,
  filters: { type: string; university: string; skill: string }
) {
  const university = normalizeText(filters.university);
  const skill = normalizeText(filters.skill);

  return talents.filter((talent) => {
    if (
      filters.type &&
      !(talent.opportunity_types ?? []).includes(filters.type)
    ) {
      return false;
    }

    if (
      university &&
      !normalizeText(talent.profile?.university).includes(university)
    ) {
      return false;
    }

    if (
      skill &&
      !(talent.skills ?? []).some((item) => normalizeText(item).includes(skill))
    ) {
      return false;
    }

    return true;
  });
}

function filterOpportunities(
  opportunities: CuratedOpportunity[],
  filters: { type: string; skill: string }
) {
  const skill = normalizeText(filters.skill);

  return opportunities.filter((opportunity) => {
    if (filters.type && normalizeOpportunityType(opportunity.opportunity_type) !== filters.type) {
      return false;
    }

    if (
      skill &&
      !(opportunity.skills ?? []).some((item) => normalizeText(item).includes(skill))
    ) {
      return false;
    }

    return true;
  });
}

function deadlineLabel(deadline: string | null) {
  if (!deadline) return null;

  const daysLeft = Math.ceil(
    (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) return null;
  if (daysLeft === 0) return "Closes today";
  if (daysLeft <= 7) return `${daysLeft}d left`;

  return `Due ${new Date(deadline).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = {
    type: isOpportunityType(params.type) ? params.type : "",
    university: params.university?.trim() ?? "",
    skill: params.skill?.trim() ?? "",
  };
  const hasFilters = Boolean(filters.type || filters.university || filters.skill);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const opportunitiesPromise = supabase
    .from("fellowships")
    .select(
      "id, title, sponsor_name, amount, eligibility, deadline, status, opportunity_type, skills, location, featured"
    )
    .eq("status", "open")
    .order("featured", { ascending: false })
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(24);

  let talentQuery = supabase
    .from("talent_profiles")
    .select(
      `
      id, open_to_opportunities, opportunity_types, skills, visibility, updated_at,
      profiles!talent_profiles_user_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url)
    `
    )
    .eq("open_to_opportunities", true)
    .neq("visibility", "private")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!user) {
    talentQuery = talentQuery.eq("visibility", "public");
  }

  const currentUserPromise = user
    ? Promise.all([
        supabase
          .from("profiles")
          .select("username, full_name, university, field_of_study, bio")
          .eq("id", user.id)
          .single(),
        supabase
          .from("talent_profiles")
          .select(
            "id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility"
          )
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("posts")
          .select("id, type, status, citation_id")
          .eq("author_id", user.id),
      ])
    : Promise.resolve(null);

  const applicationsPromise = user
    ? supabase
        .from("fellowship_applications")
        .select("fellowship_id, status")
        .eq("user_id", user.id)
    : Promise.resolve({ data: [] as ApplicationSummary[] });

  const [
    { data: opportunitiesRaw },
    { data: talentRaw },
    currentUserData,
    { data: applicationsRaw },
  ] = await Promise.all([
    opportunitiesPromise,
    talentQuery,
    currentUserPromise,
    applicationsPromise,
  ]);

  const opportunities = (opportunitiesRaw ?? []) as CuratedOpportunity[];
  const filteredOpportunities = filterOpportunities(opportunities, filters);
  const applications = new Map(
    ((applicationsRaw ?? []) as ApplicationSummary[]).map((application) => [
      application.fellowship_id,
      application.status,
    ])
  );

  const talents = ((talentRaw ?? []) as TalentProfileRow[]).map((talent) => ({
    ...talent,
    profile: Array.isArray(talent.profiles)
      ? talent.profiles[0] ?? null
      : talent.profiles,
  }));
  const filteredTalents = filterTalent(talents, filters);

  const currentProfile = currentUserData?.[0].data ?? null;
  const currentTalentProfile = currentUserData?.[1].data ?? null;
  const currentPosts = currentUserData?.[2].data ?? [];
  const readiness =
    user && currentProfile
      ? getOpportunityReadinessSummary({
          profile: currentProfile,
          talentProfile: currentTalentProfile,
          posts: (currentPosts ?? []).map((post) => ({
            type: post.type,
            status: post.status,
            citation_id: post.citation_id ?? null,
          })),
        })
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {hasFilters ? (
        <RetentionEventTracker
          event="opportunity_filter_used"
          metadata={{
            source: "opportunities",
            type: filters.type || null,
            university: filters.university || null,
            skill: filters.skill || null,
          }}
        />
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-brand">
              Opportunity hub
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">
              Get ready, find openings, and be discovered
            </h1>
            <p className="mt-2 max-w-3xl text-base leading-relaxed text-gray-500">
              A student-first workspace for curated opportunities, profile
              readiness, and serious inbound interest from partners.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {opportunities.length}
              </p>
              <p className="text-xs text-gray-500">Open opportunities</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{talents.length}</p>
              <p className="text-xs text-gray-500">Open profiles</p>
            </div>
          </div>
        </div>
      </section>

      {user && readiness ? (
        <section className="space-y-4">
          <RetentionEventTracker
            event="opportunity_readiness_viewed"
            metadata={{ source: "opportunities", score: readiness.score }}
          />
          <OpportunityReadinessCard summary={readiness} source="opportunities" />
          <OpportunityProfileEditor
            userId={user.id}
            talentProfile={currentTalentProfile}
            source="opportunities"
          />
        </section>
      ) : (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Build your opportunity profile
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to choose opportunity types, add skills, and make your work
            discoverable.
          </p>
          <Link
            href="/login?redirectTo=/opportunities"
            className="mt-4 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            Sign in to start
          </Link>
        </section>
      )}

      <form className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <select
          name="type"
          defaultValue={filters.type}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
        >
          <option value="">All opportunity types</option>
          {OPPORTUNITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {OPPORTUNITY_LABELS[type]}
            </option>
          ))}
        </select>
        <input
          type="search"
          name="skill"
          defaultValue={filters.skill}
          placeholder="Filter by skill"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
        />
        <input
          type="search"
          name="university"
          defaultValue={filters.university}
          placeholder="Filter profiles by university"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
        />
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/opportunities"
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:border-gray-300"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Available opportunities
            </h2>
            <p className="text-sm text-gray-500">
              Curated roles and programs from the existing fellowship pipeline.
            </p>
          </div>
          <Link
            href="/fellowships"
            className="text-sm font-medium text-emerald-brand hover:text-emerald-700"
          >
            View all
          </Link>
        </div>

        {filteredOpportunities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
            <p className="text-sm font-medium text-gray-700">
              No curated opportunities match this search.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Complete your profile now so you are ready when new openings go
              live.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredOpportunities.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                applicationStatus={applications.get(opportunity.id) ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Open profiles</h2>
          <p className="text-sm text-gray-500">
            Students who have made their work discoverable for partners and
            collaborators.
          </p>
        </div>

        {filteredTalents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
            <p className="text-sm font-medium text-gray-700">
              No open profiles match this search.
            </p>
            <Link
              href="/opportunities"
              className="mt-4 inline-flex rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredTalents.map((talent) => (
              <TalentCard key={talent.id} talent={talent} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  applicationStatus,
}: {
  opportunity: CuratedOpportunity;
  applicationStatus: string | null;
}) {
  const type = normalizeOpportunityType(opportunity.opportunity_type);
  const deadline = deadlineLabel(opportunity.deadline);

  return (
    <Link
      href={`/fellowships/${opportunity.id}`}
      className="flex min-h-[260px] flex-col rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getOpportunityStyle(
            type
          )}`}
        >
          {getOpportunityShortLabel(type)}
        </span>
        {opportunity.featured ? (
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
            Featured
          </span>
        ) : null}
        {deadline ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {deadline}
          </span>
        ) : null}
      </div>

      <h3 className="text-base font-semibold leading-snug text-gray-900">
        {opportunity.title}
      </h3>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
        {opportunity.sponsor_name ? <span>{opportunity.sponsor_name}</span> : null}
        {opportunity.location ? <span>{opportunity.location}</span> : null}
        {opportunity.amount ? <span>{opportunity.amount}</span> : null}
      </div>

      {opportunity.eligibility ? (
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-gray-500">
          {opportunity.eligibility}
        </p>
      ) : (
        <div className="flex-1" />
      )}

      {opportunity.skills?.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {opportunity.skills.slice(0, 4).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-emerald-brand">
          {applicationStatus ? "View application" : "View details"}
        </span>
        {applicationStatus ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium capitalize text-amber-700">
            {applicationStatus}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function TalentCard({
  talent,
}: {
  talent: TalentProfileRow & { profile: OpportunityProfileSummary | null };
}) {
  const profile = talent.profile;
  const displayName = profile?.full_name ?? profile?.username ?? "ThinkAfrica member";
  const href = profile?.username ? `/${profile.username}` : "/settings";

  return (
    <Link
      href={href}
      className="flex min-h-[230px] flex-col rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
    >
      <div className="mb-4 flex items-center gap-3">
        <UserAvatar
          name={displayName}
          src={profile?.avatar_url ?? null}
          size={44}
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {displayName}
          </p>
          <p className="truncate text-xs text-gray-400">
            {profile?.university ?? "University not listed"}
          </p>
        </div>
      </div>

      {profile?.field_of_study ? (
        <p className="text-xs font-medium text-gray-500">
          {profile.field_of_study}
        </p>
      ) : null}

      {profile?.bio ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">
          {profile.bio}
        </p>
      ) : null}

      {talent.opportunity_types?.length ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {talent.opportunity_types.slice(0, 3).map((type) => (
            <span
              key={type}
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${getOpportunityStyle(
                type
              )}`}
            >
              {getOpportunityShortLabel(type)}
            </span>
          ))}
        </div>
      ) : null}

      {talent.skills?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {talent.skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {skill}
            </span>
          ))}
        </div>
      ) : null}

      <span className="mt-auto pt-5 text-sm font-semibold text-emerald-brand">
        View profile
      </span>
    </Link>
  );
}
