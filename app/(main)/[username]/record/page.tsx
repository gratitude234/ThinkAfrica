import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import EvidenceLegend from "@/components/profile/EvidenceLegend";
import ProfileRecordCard, { PROFILE_RECORD_LIST } from "@/components/profile/ProfileRecordCard";
import ScrollActiveIntoView from "@/components/profile/ScrollActiveIntoView";
import UserAvatar from "@/components/ui/UserAvatar";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getProfileIdentityLines } from "@/lib/profileIdentity";
import {
  PROFILE_RECORD_FILTERS,
  buildProfileRecordHref,
  parseProfileRecordQuery,
  profileRecordFilterLabel,
  type ProfileRecordFilter,
} from "@/lib/profileRecord";
import { RECORD_SHELL } from "@/lib/profileLayout";
import { loadProfileRecordPage, loadProfileRecordSummary } from "@/lib/profileRecordData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface RecordProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  professional_title: string | null;
  university: string | null;
  field_of_study: string | null;
  country: string | null;
  profile_type: string | null;
  organization_name: string | null;
  bio: string | null;
  verified: boolean;
  verified_type: string | null;
  is_alumni: boolean;
}

const PROFILE_SELECT =
  "id, username, full_name, avatar_url, professional_title, university, field_of_study, country, profile_type, organization_name, bio, verified, verified_type, is_alumni";

function name(profile: RecordProfile) {
  return profile.full_name?.trim() || profile.username;
}

function contextLine(profile: RecordProfile) {
  const identity = getProfileIdentityLines(profile);
  return [identity.headline, identity.affiliation].filter(Boolean).join(" · ");
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rawRecordHref(
  username: string,
  query: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams();
  for (const key of ["type", "quality", "page"] as const) {
    const value = firstQueryValue(query[key]);
    if (value !== undefined) params.set(key, value);
  }
  const suffix = params.toString();
  return `/${username}/record${suffix ? `?${suffix}` : ""}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ username }, rawQuery] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("username", username)
    .maybeSingle();
  const profile = data as RecordProfile | null;
  if (!profile) return { title: "Intellectual Record - Indegenius" };
  const query = parseProfileRecordQuery(
    {
      type: firstQueryValue(rawQuery.type),
      quality: firstQueryValue(rawQuery.quality),
      page: firstQueryValue(rawQuery.page),
    },
    FEATURE_FLAGS.research
  );
  const title = `${name(profile)}'s Intellectual Record`;
  const recordKinds = FEATURE_FLAGS.research
    ? "Publications, responses, research, and debate arguments"
    : "Publications, responses, and debate arguments";
  return {
    title,
    description: `${recordKinds} by ${name(profile)}.`,
    alternates: {
      canonical: buildProfileRecordHref({
        username: profile.username,
        filter: query.filter,
        quality: query.quality,
        page: query.page,
      }),
    },
  };
}

function filterCount(
  filter: ProfileRecordFilter,
  summary: Awaited<ReturnType<typeof loadProfileRecordSummary>>
) {
  if (filter === "publications") return summary.publicationCount;
  if (filter === "responses") return summary.responseCount;
  if (filter === "debates") return summary.debateCount;
  if (filter === "research") return summary.researchCount;
  return summary.publicationCount + summary.responseCount + summary.debateCount;
}

export default async function ProfileRecordPage({ params, searchParams }: PageProps) {
  const [{ username }, rawQuery] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("username", username)
    .maybeSingle();
  const profile = data as RecordProfile | null;
  if (!profile) notFound();

  const query = parseProfileRecordQuery(
    {
      type: firstQueryValue(rawQuery.type),
      quality: firstQueryValue(rawQuery.quality),
      page: firstQueryValue(rawQuery.page),
    },
    FEATURE_FLAGS.research
  );
  const normalizedHref = buildProfileRecordHref({
    username: profile.username,
    filter: query.filter,
    quality: query.quality,
    page: query.page,
  });
  if (rawRecordHref(profile.username, rawQuery) !== normalizedHref) {
    redirect(normalizedHref);
  }
  const [record, summary] = await Promise.all([
    loadProfileRecordPage({
      supabase,
      profileId: profile.id,
      filter: query.filter,
      quality: query.quality,
      page: query.page,
      includeResearch: FEATURE_FLAGS.research,
    }),
    loadProfileRecordSummary(supabase, profile.id, FEATURE_FLAGS.research),
  ]);

  if (query.page > 1 && record.items.length === 0) {
    redirect(
      buildProfileRecordHref({
        username: profile.username,
        filter: query.filter,
        quality: query.quality,
      })
    );
  }

  const filters = PROFILE_RECORD_FILTERS.filter(
    (filter) => FEATURE_FLAGS.research || filter !== "research"
  );
  const showQuality = query.filter === "publications" || query.filter === "research";

  return (
    <div className={`${RECORD_SHELL} space-y-6`}>
      <header className="rounded-xl border border-card-border bg-card p-5 sm:p-6">
        <Link
          href={`/${profile.username}`}
          className="tap-target focus-ring text-sm font-semibold text-emerald-ink hover:underline"
        >
          ← Back to profile
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <UserAvatar name={name(profile)} src={profile.avatar_url} size={52} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
              {name(profile)}&apos;s Intellectual Record
            </h1>
            <p className="mt-1 text-sm text-ink-muted">{contextLine(profile)}</p>
          </div>
        </div>
      </header>

      <section aria-label="Record filters" className="space-y-3">
        <ScrollActiveIntoView className="scroll-hint-x flex overflow-x-auto border-b border-card-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map((filter) => {
            const active = query.filter === filter;
            return (
              <Link
                key={filter}
                href={buildProfileRecordHref({ username: profile.username, filter })}
                aria-current={active ? "page" : undefined}
                className={`focus-ring -mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-semibold ${
                  active
                    ? "border-emerald-brand text-ink"
                    : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {profileRecordFilterLabel(filter)}
                <span className="ml-1.5 text-xs font-normal text-ink-muted">
                  {filterCount(filter, summary).toLocaleString()}
                </span>
              </Link>
            );
          })}
        </ScrollActiveIntoView>

        {/* The row keeps its height on every tab. It used to appear only for
            Publications and Research, so moving between filters inserted or
            removed 40px and jumped every card below it, arriving after a route
            transition where it read as a rendering fault. */}
        <div className="flex min-h-[40px] flex-wrap items-center gap-2" aria-label="Evidence filters">
          {showQuality
            ? ([
                ["all", "All evidence"],
                ["source_backed", "Source-backed"],
                ["citable", "Citable"],
              ] as const).map(([quality, label]) => (
                <Link
                  key={quality}
                  href={buildProfileRecordHref({
                    username: profile.username,
                    filter: query.filter,
                    quality,
                  })}
                  aria-current={query.quality === quality ? "page" : undefined}
                  className={`tap-target focus-ring inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    query.quality === quality
                      ? "border-emerald-brand bg-green-tint text-emerald-brand"
                      : "border-card-border bg-card text-ink-muted hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              ))
            : null}
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {record.totalCount.toLocaleString()} result{record.totalCount === 1 ? "" : "s"}
        </p>
        <EvidenceLegend />
      </div>

      {record.items.length > 0 ? (
        <div className={PROFILE_RECORD_LIST}>
          {record.items.map((item) => (
            <ProfileRecordCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-card-border bg-card p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">Nothing here yet</h2>
          <p className="mt-2 text-sm text-ink-muted">
            This part of the Intellectual Record has no public entries.
          </p>
        </div>
      )}

      {record.hasPreviousPage || record.hasNextPage ? (
        <nav aria-label="Record pages" className="flex items-center justify-between border-t border-card-border pt-4">
          {record.hasPreviousPage ? (
            <Link
              href={buildProfileRecordHref({
                username: profile.username,
                filter: query.filter,
                quality: query.quality,
                page: query.page - 1,
              })}
              className="focus-ring inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:border-card-border-hover hover:text-ink"
            >
              ← Previous
            </Link>
          ) : <span />}
          <span className="text-xs text-ink-muted">Page {query.page}</span>
          {record.hasNextPage ? (
            <Link
              href={buildProfileRecordHref({
                username: profile.username,
                filter: query.filter,
                quality: query.quality,
                page: query.page + 1,
              })}
              className="focus-ring inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:border-card-border-hover hover:text-ink"
            >
              Next →
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
