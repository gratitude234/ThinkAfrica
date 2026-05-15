import Link from "next/link";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  getOpportunityShortLabel,
  getOpportunityStyle,
  OPPORTUNITY_LABELS,
  OPPORTUNITY_TYPES,
} from "@/lib/opportunities";
import {
  getTalentDiscoverySummary,
  type TalentDiscoverySignal,
} from "@/lib/talentDiscovery";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  searchParams: Promise<{
    field?: string;
    university?: string;
    country?: string;
    skill?: string;
    type?: string;
    proof?: string;
    ready?: string;
  }>;
}

interface TalentProfileRow {
  id: string;
  user_id: string;
  open_to_opportunities: boolean | null;
  opportunity_types: string[] | null;
  skills: string[] | null;
  visibility: string | null;
  cv_url?: string | null;
  linkedin_url?: string | null;
  updated_at: string | null;
  profiles:
    | TalentOwnerProfile
    | TalentOwnerProfile[]
    | null;
}

interface TalentOwnerProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  verified_type: string | null;
  interests: string[] | null;
}

interface TalentPostRow {
  author_id: string | null;
  type: string | null;
  status: string | null;
  citation_id: string | null;
  post_references?: { id: string }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function cleanParam(value: string | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function containsValue(value: string | null | undefined, query: string) {
  if (!query) return true;
  return (value ?? "").toLowerCase().includes(query);
}

function signalClasses(tone: TalentDiscoverySignal["tone"]) {
  switch (tone) {
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "sky":
      return "border-sky-100 bg-sky-50 text-sky-700";
    case "purple":
      return "border-purple-100 bg-purple-50 text-purple-700";
    case "amber":
      return "border-amber-100 bg-amber-50 text-amber-700";
    default:
      return "border-gray-200 bg-gray-50 text-gray-600";
  }
}

export default async function TalentPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = {
    field: cleanParam(params.field),
    university: cleanParam(params.university),
    country: cleanParam(params.country),
    skill: cleanParam(params.skill),
    type: cleanParam(params.type),
    proof: params.proof === "1",
    ready: params.ready === "1",
  };
  const hasFilters = Object.values(filters).some(Boolean);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("talent_profiles")
    .select(
      `
      id, user_id, open_to_opportunities, opportunity_types, skills, visibility, cv_url, linkedin_url, updated_at,
      profiles!talent_profiles_user_id_fkey (
        id, username, full_name, country, university, field_of_study, bio, avatar_url, verified, verified_type, interests
      )
    `
    )
    .eq("open_to_opportunities", true)
    .neq("visibility", "private")
    .order("updated_at", { ascending: false });

  if (!user) {
    query = query.eq("visibility", "public");
  }

  const { data: talentsRaw } = await query;
  const talents = ((talentsRaw ?? []) as TalentProfileRow[]).map((talent) => ({
    ...talent,
    profile: firstRelation(talent.profiles),
  }));

  const ownerIds = talents.map((talent) => talent.user_id).filter(Boolean);
  const { data: postsRaw } =
    ownerIds.length > 0
      ? await supabase
          .from("posts")
          .select("author_id, type, status, citation_id, post_references(id)")
          .eq("status", "published")
          .in("author_id", ownerIds)
      : { data: [] };

  const postsByAuthor = new Map<string, TalentPostRow[]>();
  for (const post of (postsRaw ?? []) as TalentPostRow[]) {
    if (!post.author_id) continue;
    const current = postsByAuthor.get(post.author_id) ?? [];
    current.push(post);
    postsByAuthor.set(post.author_id, current);
  }

  const enrichedTalents = talents.map((talent) => {
    const posts = (postsByAuthor.get(talent.user_id) ?? []).map((post) => ({
      type: post.type,
      status: post.status,
      citation_id: post.citation_id,
      referenceCount: post.post_references?.length ?? 0,
    }));
    const summary = getTalentDiscoverySummary({
      profile: talent.profile,
      talentProfile: talent,
      posts,
    });
    return { ...talent, posts, summary };
  });

  const filteredTalents = enrichedTalents
    .filter((talent) => {
      const profile = talent.profile;
      const skills = talent.skills ?? [];
      const types = talent.opportunity_types ?? [];
      return (
        containsValue(profile?.field_of_study, filters.field) &&
        containsValue(profile?.university, filters.university) &&
        containsValue(profile?.country, filters.country) &&
        (!filters.skill ||
          skills.some((skill) => skill.toLowerCase().includes(filters.skill))) &&
        (!filters.type || types.includes(filters.type)) &&
        (!filters.proof ||
          talent.summary.hasReviewedOrCitableWork ||
          talent.summary.hasSourceBackedWork) &&
        (!filters.ready || talent.summary.readinessScore >= 85)
      );
    })
    .sort((left, right) => {
      if (!user) return 0;
      return right.summary.score - left.summary.score;
    });

  return (
    <div className="mx-auto max-w-6xl">
      <RetentionEventTracker
        event="opportunity_listing_opened"
        metadata={{
          source: "talent",
          signedIn: Boolean(user),
          hasFilters,
          resultCount: filteredTalents.length,
        }}
      />

      <div className="mb-8">
        <p className="text-sm font-medium text-emerald-700">Partner discovery</p>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Discover credible student talent
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">
              Filter by fit, proof, and readiness, then send structured outreach
              that helps candidates evaluate the opportunity quickly.
            </p>
          </div>
          {!user ? (
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Link href="/login" className="font-semibold hover:underline">
                Sign in
              </Link>{" "}
              to see partner-visible profiles.
            </p>
          ) : null}
        </div>
      </div>

      <form className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Field</span>
            <input
              name="field"
              defaultValue={params.field ?? ""}
              placeholder="Economics, public health..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">University</span>
            <input
              name="university"
              defaultValue={params.university ?? ""}
              placeholder="University"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Country</span>
            <input
              name="country"
              defaultValue={params.country ?? ""}
              placeholder="Country"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Skill</span>
            <input
              name="skill"
              defaultValue={params.skill ?? ""}
              placeholder="Data, research..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Opportunity</span>
            <select
              name="type"
              defaultValue={params.type ?? ""}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-brand"
            >
              <option value="">Any type</option>
              {OPPORTUNITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {OPPORTUNITY_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                name="proof"
                value="1"
                defaultChecked={filters.proof}
                className="h-4 w-4 rounded border-gray-300 text-emerald-brand focus:ring-emerald-brand"
              />
              Reviewed, citable, or source-backed work
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                name="ready"
                value="1"
                defaultChecked={filters.ready}
                className="h-4 w-4 rounded border-gray-300 text-emerald-brand focus:ring-emerald-brand"
              />
              Opportunity-ready
            </label>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters ? (
              <Link
                href="/talent"
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Clear
              </Link>
            ) : null}
            <button
              type="submit"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Apply filters
            </button>
          </div>
        </div>
      </form>

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filteredTalents.length} {filteredTalents.length === 1 ? "candidate" : "candidates"}
          {user ? " ranked by readiness and credibility" : " visible publicly"}
        </p>
      </div>

      {filteredTalents.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center">
          <p className="font-medium text-gray-900">No talent profiles match these filters.</p>
          <p className="mt-1 text-sm text-gray-500">
            Broaden the criteria or check back as more students make their
            opportunity profile discoverable.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTalents.map((talent) => {
            const profile = talent.profile;
            const profileHref = profile?.username
              ? `/${profile.username}?tab=opportunities`
              : "#";
            const displayName = profile?.full_name ?? profile?.username ?? "Student profile";
            return (
              <Link
                key={talent.id}
                href={profileHref}
                className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar
                    name={displayName}
                    src={profile?.avatar_url}
                    size={44}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {displayName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[profile?.field_of_study, profile?.university]
                        .filter(Boolean)
                        .join(" / ") || "Academic profile"}
                    </p>
                    {profile?.country ? (
                      <p className="mt-0.5 text-xs text-gray-400">{profile.country}</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                    {talent.summary.readinessScore}%
                  </span>
                </div>

                <div className="mt-4 rounded-lg bg-canvas px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Why this candidate stands out
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900">
                    {talent.summary.sortReason ?? talent.summary.strongestSignal ?? "Open to relevant opportunities"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {talent.summary.signals.slice(0, 4).map((signal) => (
                    <span
                      key={signal.key}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${signalClasses(
                        signal.tone
                      )}`}
                    >
                      {signal.label}
                    </span>
                  ))}
                </div>

                {talent.opportunity_types && talent.opportunity_types.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1">
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

                {talent.skills && talent.skills.length > 0 ? (
                  <div className="mt-auto flex flex-wrap gap-1 pt-4">
                    {talent.skills.slice(0, 5).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                      >
                        {skill}
                      </span>
                    ))}
                    {talent.skills.length > 5 ? (
                      <span className="text-xs text-gray-400">
                        +{talent.skills.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
