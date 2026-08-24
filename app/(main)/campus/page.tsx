import type { Metadata } from "next";
import Link from "next/link";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import CampusPromptLink from "@/components/campus/CampusPromptLink";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  formatCampusProgramValue,
  getCampusContributionNextAction,
} from "@/lib/campus";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const DESCRIPTION =
  "Join recurring writing, response, and debate programs at selected Indegenius campus cohorts.";

export const metadata: Metadata = {
  title: "Campus Programs",
  description: DESCRIPTION,
  alternates: { canonical: canonicalPath("/campus") },
  openGraph: {
    title: "Campus Programs | Indegenius",
    description: DESCRIPTION,
    url: absoluteUrl("/campus"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
};

interface CampusCohort {
  id: string;
  university: string;
  country: string | null;
  status: string;
}

interface CampusPrompt {
  id: string;
  title: string;
  prompt_text: string;
  response_question: string | null;
  topic: string | null;
  cadence: string;
  ends_at: string | null;
}

interface CampusProgram {
  id: string;
  title: string;
  description: string;
  format: string;
  recurrence: string;
  next_session_at: string | null;
}

interface CampusContributor {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface CampusPost {
  id: string;
  slug: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  profiles:
    | { username: string | null; full_name: string | null; university: string | null }
    | { username: string | null; full_name: string | null; university: string | null }[]
    | null;
}

function formatSchedule(value: string | null) {
  if (!value) return "Next date to be announced";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function relationOne<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function CampusPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: cohortMembership },
    { data: ambassadorAssignment },
    { data: selectedCohortsRaw },
  ] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select("university, country, interests")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("campus_cohort_memberships")
          .select("cohort_id")
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("campus_ambassadors")
          .select("campus_cohort_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("campus_cohorts")
      .select("id, university, country, status")
      .in("status", ["selected", "active"])
      .order("university", { ascending: true }),
  ]);

  const selectedCohorts = (selectedCohortsRaw ?? []) as CampusCohort[];
  const university = profile?.university?.trim() ?? null;
  const assignedCohortId =
    cohortMembership?.cohort_id ?? ambassadorAssignment?.campus_cohort_id;
  const cohort = assignedCohortId
    ? selectedCohorts.find((candidate) => candidate.id === assignedCohortId) ?? null
    : null;

  if (!user || !cohort) {
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="rounded-2xl bg-emerald-brand p-7 text-white sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            Campus circles
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
            Build intellectual habits with the same people each week.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
            Indegenius is concentrating prompts, response circles, publication clinics,
            and debates within a small set of campus cohorts before expanding.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!user ? (
              <Link href="/login?redirectTo=%2Fcampus" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900">
                Sign in to find your campus
              </Link>
            ) : !university ? (
              <Link href="/settings" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900">
                Add your university
              </Link>
            ) : (
              <Link href="/ambassadors" className="inline-flex min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900">
                Follow the campus rollout
              </Link>
            )}
            <Link href="/explore" className="inline-flex min-h-11 items-center rounded-lg border border-white/25 px-4 text-sm font-semibold text-white">
              Discover ideas
            </Link>
          </div>
        </header>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">Selected campuses</h2>
          <p className="mt-1 text-sm text-gray-500">
            New campus programming opens only when a cohort has operating support.
          </p>
          {selectedCohorts.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              The first campus cohort has not been selected yet.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {selectedCohorts.map((item) => (
                <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <p className="text-sm font-semibold text-gray-900">{item.university}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.country ?? "Country not set"}</p>
                  <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-emerald-700">
                    {item.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const now = new Date().toISOString();
  const [promptsResult, programsResult, contributorsResult, postsResult, ownPostsResult] =
    await Promise.all([
      supabase
        .from("campus_editorial_prompts")
        .select("id, title, prompt_text, response_question, topic, cadence, ends_at")
        .eq("cohort_id", cohort.id)
        .eq("active", true)
        .lte("starts_at", now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("starts_at", { ascending: false })
        .limit(3),
      supabase
        .from("campus_programs")
        .select("id, title, description, format, recurrence, next_session_at")
        .eq("cohort_id", cohort.id)
        .eq("active", true)
        .order("next_session_at", { ascending: true, nullsFirst: false })
        .limit(6),
      supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .ilike("university", cohort.university)
        .not("username", "is", null)
        .limit(8),
      supabase
        .from("posts")
        .select(
          "id, slug, title, excerpt, published_at, profiles!posts_author_id_fkey!inner(username, full_name, university)"
        )
        .eq("status", "published")
        .ilike("profiles.university", cohort.university)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(6),
      supabase
        .from("posts")
        .select("id, in_response_to")
        .eq("author_id", user.id)
        .eq("status", "published")
        .limit(100),
    ]);

  const interestKeys = new Set(
    ((profile?.interests as string[] | null) ?? []).map((interest) =>
      interest.trim().toLocaleLowerCase("en")
    )
  );
  const prompts = ((promptsResult.data ?? []) as CampusPrompt[])
    .map((prompt, originalIndex) => ({ prompt, originalIndex }))
    .sort((left, right) => {
      const leftMatch = left.prompt.topic
        ? Number(interestKeys.has(left.prompt.topic.trim().toLocaleLowerCase("en")))
        : 0;
      const rightMatch = right.prompt.topic
        ? Number(interestKeys.has(right.prompt.topic.trim().toLocaleLowerCase("en")))
        : 0;
      return rightMatch - leftMatch || left.originalIndex - right.originalIndex;
    })
    .map(({ prompt }) => prompt);
  const programs = (programsResult.data ?? []) as CampusProgram[];
  const contributors = (contributorsResult.data ?? []) as CampusContributor[];
  const posts = (postsResult.data ?? []) as CampusPost[];
  const ownPosts = ownPostsResult.data ?? [];
  const publishedCount = ownPosts.length;
  const responsesPublishedCount = ownPosts.filter((post) => post.in_response_to).length;
  const currentPrompt = prompts[0] ?? null;
  const nextAction = getCampusContributionNextAction({
    publishedCount,
    responsesPublishedCount,
    promptId: currentPrompt?.id,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RetentionEventTracker
        event="campus_hub_viewed"
        metadata={{ cohortId: cohort.id, university: cohort.university }}
      />

      <header className="rounded-2xl bg-emerald-brand p-7 text-white sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              Your campus cohort
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold">{cohort.university}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
              One prompt, recurring programs, and visible response loops designed to make useful contribution habitual.
            </p>
          </div>
          {ambassadorAssignment?.campus_cohort_id === cohort.id ? (
            <Link href="/ambassadors/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-4 text-sm font-semibold text-emerald-900">
              Ambassador dashboard
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
          Your next loop
        </p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-950">{nextAction.title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">{nextAction.description}</p>
          </div>
          {currentPrompt && ["first_publication", "second_publication"].includes(nextAction.key) ? (
            <CampusPromptLink
              promptId={currentPrompt.id}
              source="campus_hub"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white"
            >
              {nextAction.cta}
            </CampusPromptLink>
          ) : (
            <Link href={nextAction.href} className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white">
              {nextAction.cta}
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="campus-prompts-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Editorial rhythm</p>
            <h2 id="campus-prompts-title" className="mt-1 text-xl font-semibold text-gray-950">Current prompts</h2>
          </div>
        </div>
        {prompts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            The next campus prompt is being prepared. You can still publish or respond now.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {prompts.map((prompt, index) => (
              <article key={prompt.id} className={`rounded-xl border bg-white p-5 ${index === 0 ? "border-emerald-300 shadow-sm" : "border-gray-200"}`}>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  <span>{formatCampusProgramValue(prompt.cadence)}</span>
                  {prompt.topic ? <span className="rounded-full bg-gray-100 px-2 py-1 normal-case tracking-normal">{prompt.topic}</span> : null}
                </div>
                <h3 className="mt-3 text-base font-semibold text-gray-950">{prompt.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{prompt.prompt_text}</p>
                {prompt.response_question ? (
                  <p className="mt-3 rounded-lg bg-canvas p-3 text-xs leading-5 text-gray-600">
                    <span className="font-semibold text-gray-800">Response question:</span>{" "}{prompt.response_question}
                  </p>
                ) : null}
                <CampusPromptLink promptId={prompt.id} source="campus_hub" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700">
                  Write from this prompt →
                </CampusPromptLink>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-950">Recurring programs</h2>
          <div className="mt-3 divide-y divide-gray-100">
            {programs.length === 0 ? <p className="py-6 text-sm text-gray-400">No recurring program is scheduled yet.</p> : programs.map((program) => (
              <article key={program.id} className="py-4 first:pt-1">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  <span>{formatCampusProgramValue(program.format)}</span>
                  <span>·</span>
                  <span>{formatCampusProgramValue(program.recurrence)}</span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-gray-900">{program.title}</h3>
                <p className="mt-1 text-sm leading-5 text-gray-500">{program.description}</p>
                <p className="mt-2 text-xs font-medium text-gray-700">{formatSchedule(program.next_session_at)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-gray-950">Campus contributors</h2>
          <p className="mt-1 text-sm text-gray-500">People at your university building public Intellectual Records.</p>
          <div className="mt-4 space-y-3">
            {contributors.map((contributor) => (
              <Link key={contributor.id} href={`/${contributor.username}`} className="flex min-h-11 items-center gap-3 rounded-lg hover:bg-canvas">
                <UserAvatar name={contributor.full_name ?? contributor.username} src={contributor.avatar_url} size={38} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">{contributor.full_name ?? contributor.username}</span>
                  <span className="block truncate text-xs text-gray-500">@{contributor.username}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section>
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Campus record</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-950">Recent contributions</h2>
          </div>
          <Link href="/responses" className="text-sm font-semibold text-emerald-700">Find responses</Link>
        </div>
        {posts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">No campus contribution has been published yet.</div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {posts.map((post) => {
              const author = relationOne(post.profiles);
              return (
                <Link key={post.id} href={`/post/${post.slug}`} className="rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-emerald-200">
                  <p className="text-xs font-medium text-gray-500">{author?.full_name ?? author?.username ?? "Campus contributor"}</p>
                  <h3 className="mt-2 line-clamp-2 text-base font-semibold text-gray-950">{post.title?.trim() || post.excerpt?.trim() || "Untitled contribution"}</h3>
                  {post.excerpt && post.title ? <p className="mt-2 line-clamp-2 text-sm leading-5 text-gray-500">{post.excerpt}</p> : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
