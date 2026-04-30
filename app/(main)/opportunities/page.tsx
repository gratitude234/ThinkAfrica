import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getOpportunityReadinessSummary } from "@/lib/opportunityReadiness";
import OpportunityProfileEditor from "@/components/opportunities/OpportunityProfileEditor";
import OpportunityReadinessCard from "@/components/opportunities/OpportunityReadinessCard";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import UserAvatar from "@/components/ui/UserAvatar";

interface PageProps {
  searchParams: Promise<{
    mode?: string;
    type?: string;
    university?: string;
    skill?: string;
  }>;
}

const OPPORTUNITY_TYPES = ["internship", "research", "fellowship", "job"];
const OPPORTUNITY_LABELS: Record<string, string> = {
  internship: "Internship",
  research: "Research",
  fellowship: "Fellowship",
  job: "Job",
};

const OPPORTUNITY_STYLES: Record<string, string> = {
  internship: "bg-blue-50 text-blue-700",
  research: "bg-purple-50 text-purple-700",
  fellowship: "bg-amber-50 text-amber-700",
  job: "bg-emerald-50 text-emerald-700",
};

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

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const activeMode = params.mode === "available" ? "available" : "profiles";
  const filters = {
    type: OPPORTUNITY_TYPES.includes(params.type ?? "") ? params.type ?? "" : "",
    university: params.university?.trim() ?? "",
    skill: params.skill?.trim() ?? "",
  };
  const hasFilters = Boolean(filters.type || filters.university || filters.skill);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fellowshipPromise =
    FEATURE_FLAGS.fellowshipsSection && activeMode === "available"
      ? supabase
          .from("fellowships")
          .select("id, title, sponsor_name, deadline, status")
          .eq("status", "open")
          .order("deadline", { ascending: true, nullsFirst: false })
          .limit(12)
      : Promise.resolve({ data: [] as never[] });

  const talentPromise = supabase
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

  const [
    { data: fellowshipsRaw },
    { data: talentRaw },
    currentUserData,
  ] = await Promise.all([fellowshipPromise, talentPromise, currentUserPromise]);

  const talents = ((talentRaw ?? []) as TalentProfileRow[]).map((talent) => ({
    ...talent,
    profile: Array.isArray(talent.profiles)
      ? talent.profiles[0] ?? null
      : talent.profiles,
  }));
  const filteredTalents = filterTalent(talents, filters);
  const fellowships = fellowshipsRaw ?? [];

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
    <div className="mx-auto max-w-6xl">
      {hasFilters ? (
        <RetentionEventTracker
          event="opportunity_filter_used"
          metadata={{
            source: "opportunities",
            mode: activeMode,
            type: filters.type || null,
            university: filters.university || null,
            skill: filters.skill || null,
          }}
        />
      ) : null}

      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-brand">
          Opportunity outcomes
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Get discovered for serious work
        </h1>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-gray-500">
          Students can make their academic profile visible for internships,
          research collaborations, fellowships, and jobs.
        </p>
      </div>

      {user && readiness ? (
        <div className="mb-8 space-y-4">
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
        </div>
      ) : (
        <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
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

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/opportunities"
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            activeMode === "profiles"
              ? "bg-emerald-brand text-white"
              : "border border-gray-200 bg-white text-gray-600"
          }`}
        >
          Open profiles
        </Link>
        <Link
          href="/opportunities?mode=available"
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            activeMode === "available"
              ? "bg-emerald-brand text-white"
              : "border border-gray-200 bg-white text-gray-600"
          }`}
        >
          Available opportunities
        </Link>
      </div>

      {activeMode === "profiles" ? (
        <section>
          <form className="mb-5 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <input type="hidden" name="mode" value="profiles" />
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
              name="university"
              defaultValue={filters.university}
              placeholder="Filter by university"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <input
              type="search"
              name="skill"
              defaultValue={filters.skill}
              placeholder="Filter by skill"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
            >
              Filter
            </button>
          </form>

          {filteredTalents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                No open profiles match this search.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link
                  href="/opportunities"
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Clear filters
                </Link>
                <Link
                  href="/?guest=1"
                  className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white"
                >
                  Browse latest posts
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTalents.map((talent) => {
                const profile = talent.profile;
                const displayName =
                  profile?.full_name ??
                  profile?.username ??
                  "ThinkAfrika member";

                return (
                  <Link
                    key={talent.id}
                    href={profile?.username ? `/${profile.username}` : "/settings"}
                    className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
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

                    {talent.opportunity_types?.length ? (
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {talent.opportunity_types.slice(0, 3).map((type) => (
                          <span
                            key={type}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              OPPORTUNITY_STYLES[type] ??
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {OPPORTUNITY_LABELS[type] ?? type}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {talent.skills?.length ? (
                      <div className="flex flex-wrap gap-1.5">
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
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section>
          {FEATURE_FLAGS.fellowshipsSection && fellowships.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fellowships.map((fellowship) => (
                <Link
                  key={fellowship.id}
                  href={`/fellowships/${fellowship.id}`}
                  className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <p className="text-base font-semibold text-gray-900">
                    {fellowship.title}
                  </p>
                  {fellowship.sponsor_name ? (
                    <p className="mt-1 text-sm text-emerald-brand">
                      {fellowship.sponsor_name}
                    </p>
                  ) : null}
                  {fellowship.deadline ? (
                    <p className="mt-3 text-xs text-gray-400">
                      Deadline:{" "}
                      {new Date(fellowship.deadline).toLocaleDateString()}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-300 bg-canvas p-8 text-center">
              <p className="text-sm font-medium text-gray-700">
                Curated opportunities are not live yet.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Make your profile discoverable now so the right people can find
                your work.
              </p>
              <Link
                href="/opportunities"
                className="mt-4 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white"
              >
                View open profiles
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
