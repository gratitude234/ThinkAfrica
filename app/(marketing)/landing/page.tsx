import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import Footer from "@/components/ui/Footer";
import PostCover from "@/components/post/PostCover";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPublicTopicCounts, type TopicCount } from "@/lib/discoverData";
import { getPostDisplayTitle, getPostMetadataTitle, isLightweightPost } from "@/lib/postDisplay";
import LandingTrackedLink from "./LandingTrackedLink";
import LandingAnimations from "./LandingAnimations";
import LandingNav from "./LandingNav";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

// ── Types ────────────────────────────────────────────────────────────

type LandingPost = {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  view_count: number | null;
  published_at: string | null;
  featured?: boolean | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
  } | null;
};

type LandingPostRaw = Omit<LandingPost, "profiles"> & {
  profiles: LandingPost["profiles"] | LandingPost["profiles"][];
};

type LandingData = {
  postsRaw: LandingPostRaw[];
  postCount: number;
  userCount: number;
  topics: TopicCount[];
};

export const revalidate = 300;

export const metadata: Metadata = {
  title: "African Student Essays, Research and Policy Ideas",
  description:
    "Read serious essays, research, policy briefs, and debates from African university students and emerging thinkers.",
  alternates: { canonical: canonicalPath("/landing") },
  openGraph: {
    title: "Indegenius - African Student Essays, Research and Policy Ideas",
    description:
      "Read serious essays, research, policy briefs, and debates from African university students and emerging thinkers.",
    url: absoluteUrl("/landing"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Indegenius - African Student Essays, Research and Policy Ideas",
    description:
      "Read serious essays, research, policy briefs, and debates from African university students and emerging thinkers.",
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

// ── Static data ──────────────────────────────────────────────────────

const TOPICS_DISPLAY_LIMIT = 12;

const VALUE_PROPS = [
  {
    num: "01",
    numStyle: "bg-emerald-100 text-emerald-600",
    title: "Find serious student ideas",
    desc: "Read essays, research, and policy briefs from students writing beyond the quick-take feed — with real citations, arguments, and bylines.",
  },
  {
    num: "02",
    numStyle: "bg-amber-100 text-amber-700",
    title: "Follow credible writers",
    desc: "Author profiles show university, field of study, peer-review history, and point tier — so you can decide whose work is worth tracking.",
  },
  {
    num: "03",
    numStyle: "bg-purple-100 text-purple-700",
    title: "Respond thoughtfully",
    desc: "Move from reading into questions, counterpoints, and response posts — or join a structured debate and have your argument evaluated by peers.",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function typeBadge(post: LandingPost): { classes: string; label: string } {
  // A genuinely titleless lightweight Post gets the new "Post" label; a
  // legacy titled Blog (also resolves to "post") keeps its existing
  // "Blog" label below, same rule as lib/postQuality.ts's contentLabel.
  if (isLightweightPost(post)) {
    return { classes: "bg-green-tint text-emerald-brand", label: "Post" };
  }

  switch (post.type) {
    case "essay":        return { classes: "bg-gold-tint text-gold-ink",         label: "Essay" };
    case "research":     return { classes: "bg-purple-tint text-purple-accent",  label: "Research" };
    case "policy_brief": return { classes: "bg-purple-tint text-purple-accent",  label: "Policy Brief" };
    case "quick_take":   return { classes: "bg-green-tint text-emerald-brand",   label: "Quick Take" };
    default:             return { classes: "bg-green-tint text-emerald-brand",   label: "Blog" };
  }
}

/** Titleless lightweight Post: lead with the excerpt instead of a blank/fabricated headline. */
function postHeadline(post: LandingPost): string {
  return (
    getPostDisplayTitle(post) ?? post.excerpt?.trim() ?? getPostMetadataTitle(post, post.profiles)
  );
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 7)  return `${days}d ago`;
  if (days < 14) return "1w ago";
  return `${Math.floor(days / 7)}w ago`;
}

function authorLine(post: LandingPost) {
  const p = post.profiles;
  return {
    name: p?.full_name ?? p?.username ?? "Indegenius",
    university: p?.university ?? null,
  };
}

async function fetchLandingData(
  supabase: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>
): Promise<LandingData> {
  const [{ data: postsRaw }, { count: postCount }, { count: userCount }, topicCounts] =
    await Promise.all([
      supabase
        .from("posts")
        .select(
          `id, title, slug, type, content_kind, article_format, excerpt, cover_image_url, view_count, published_at, featured,
           profiles!posts_author_id_fkey (username, full_name, university)`
        )
        .eq("status", "published")
        .order("featured", { ascending: false })
        .order("view_count", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(7),
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      getPublicTopicCounts(supabase),
    ]);

  return {
    postsRaw: (postsRaw ?? []) as LandingPostRaw[],
    postCount: postCount ?? 0,
    userCount: userCount ?? 0,
    topics: topicCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, TOPICS_DISPLAY_LIMIT),
  };
}

const getCachedLandingData = unstable_cache(
  async () => fetchLandingData(createAdminClient()),
  ["marketing-landing-data"],
  { revalidate: 300, tags: ["landing", "public"] }
);

// ── Page ─────────────────────────────────────────────────────────────

export default async function LandingPage() {
  const { postsRaw, postCount, userCount, topics } =
    process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await getCachedLandingData()
      : await fetchLandingData(await createClient());

  const posts: LandingPost[] = postsRaw.map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? (p.profiles[0] ?? null) : p.profiles,
  }));

  const [leadPost = null, ...rest] = posts;
  const railPosts  = rest.slice(0, 3);
  const gridPosts  = posts.slice(0, 4);
  const primaryHref = leadPost ? `/post/${leadPost.slug}` : "/?guest=1";

  const displayPostCount = postCount;
  const displayUserCount = userCount;

  const stats = [
    ...(displayUserCount > 0
      ? [{ value: displayUserCount, suffix: "", label: "Student writers" }]
      : []),
    ...(displayPostCount > 0
      ? [{ value: displayPostCount, suffix: "", label: "Published posts" }]
      : []),
    { value: 142, suffix: "", label: "Universities represented" },
    { value: 38,  suffix: "", label: "African countries" },
  ];

  return (
    <div className="landing-page">
      <LandingNav />
      <LandingAnimations />
      <RetentionEventTracker
        event="landing_viewed"
        metadata={{ source: "landing", postCount: displayPostCount, visiblePosts: posts.length }}
      />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="border-b border-gray-200 py-8 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-7 lg:grid-cols-[1fr_440px] lg:gap-16">

            {/* Copy */}
            <div>
              <div className="hero-animate hero-eyebrow mb-4 flex items-center gap-2.5 sm:mb-6">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-brand" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
                  Africa&apos;s intellectual social network
                </span>
              </div>

              <h1 className="hero-animate hero-h1 max-w-[11ch] font-display text-[40px] leading-[1.02] tracking-normal text-ink sm:max-w-none sm:text-[64px]">
                Where Africa&apos;s<br />
                best student<br />
                ideas{" "}
                <em className="text-emerald-500">live.</em>
              </h1>

              <p className="hero-animate hero-sub mt-4 mb-6 max-w-[480px] text-[15px] leading-[1.65] text-ink-muted sm:mt-6 sm:mb-9 sm:text-lg">
                Essays, research, and policy briefs written by university students across Africa, rigorously argued and openly published.
              </p>

              {leadPost ? (
                <LandingTrackedLink
                  href={`/post/${leadPost.slug}`}
                  event="landing_read_clicked"
                  metadata={{ source: "mobile_featured_read", postId: leadPost.id }}
                  className="hero-animate mb-6 grid grid-cols-[88px_1fr] items-stretch gap-3 border-y border-gray-200 py-3.5 lg:hidden"
                >
                  <PostCover
                    src={leadPost.cover_image_url}
                    alt={getPostDisplayTitle(leadPost)}
                    type={leadPost.type}
                    content_kind={leadPost.content_kind}
                    article_format={leadPost.article_format}
                    sizes="88px"
                    className="h-[92px] rounded-[10px]"
                    imageClassName="object-cover"
                  />
                  <div className="min-w-0 py-0.5">
                    <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-emerald-600">
                      Featured read
                    </p>
                    <h2 className="font-display line-clamp-2 text-[18px] font-semibold leading-snug text-ink">
                      {postHeadline(leadPost)}
                    </h2>
                    <p className="mt-2 line-clamp-1 text-xs text-ink-muted">
                      {authorLine(leadPost).name}
                      {authorLine(leadPost).university
                        ? ` / ${authorLine(leadPost).university}`
                        : ""}
                    </p>
                  </div>
                </LandingTrackedLink>
              ) : null}

              <div className="hero-animate hero-ctas grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
                <LandingTrackedLink
                  href={primaryHref}
                  event="landing_read_clicked"
                  metadata={{ source: "hero_primary", postId: leadPost?.id ?? null, postType: leadPost?.type ?? null, position: "primary" }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-brand px-5 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-[#0E4B37] sm:px-7 sm:text-base"
                >
                  Start reading
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </LandingTrackedLink>
                <LandingTrackedLink
                  href="/signup"
                  event="landing_signup_clicked"
                  metadata={{ source: "hero_secondary" }}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3.5 text-[15px] font-medium text-gray-700 transition-colors hover:bg-gray-50 sm:px-7 sm:text-base"
                >
                  Claim your handle
                </LandingTrackedLink>
              </div>

              {/* Social proof */}
              <div className="hero-animate hero-proof mt-6 flex items-start gap-3 sm:mt-8 sm:items-center sm:gap-4">
                <div className="flex">
                  {[
                    { i: "A", c: "bg-emerald-100 text-emerald-800" },
                    { i: "K", c: "bg-purple-100 text-purple-800" },
                    { i: "F", c: "bg-amber-100 text-amber-800" },
                    { i: "N", c: "bg-blue-100 text-blue-800" },
                  ].map(({ i, c }, idx) => (
                    <div
                      key={i}
                      className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-white text-xs font-semibold ${c} ${idx > 0 ? "-ml-2" : ""}`}
                    >
                      {i}
                    </div>
                  ))}
                </div>
                <p className="text-sm leading-snug text-ink-muted">
                  {displayUserCount > 0 ? (
                    <>
                      Join{" "}
                      <strong className="text-ink">
                        {displayUserCount.toLocaleString()}
                      </strong>{" "}
                      students already publishing
                    </>
                  ) : (
                    "Read student essays, research, and policy briefs already live on Indegenius"
                  )}
                </p>
              </div>
            </div>

            {/* Reading rail */}
            <div className="hero-animate hero-rail hidden rounded-2xl border border-gray-200 bg-white p-3 lg:block">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="text-[13px] font-semibold text-ink">Start reading</span>
                <LandingTrackedLink
                  href="/?guest=1"
                  event="landing_read_clicked"
                  metadata={{ source: "rail_browse_all" }}
                  className="text-xs font-semibold text-emerald-600 hover:underline"
                >
                  Browse all →
                </LandingTrackedLink>
              </div>

              {leadPost ? (
                <>
                  {/* Lead card */}
                  <LandingTrackedLink
                    href={`/post/${leadPost.slug}`}
                    event="landing_read_clicked"
                    metadata={{ source: "hero_rail", postId: leadPost.id, position: "lead" }}
                    className="mb-2 block overflow-hidden rounded-[10px] border border-gray-200 transition-shadow hover:shadow-md"
                  >
                    <PostCover
                      src={leadPost.cover_image_url}
                      alt={getPostDisplayTitle(leadPost)}
                      type={leadPost.type}
                      sizes="440px"
                      className="h-[156px] border-b border-gray-100"
                      imageClassName="object-cover"
                    />
                    <div className="p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${typeBadge(leadPost).classes}`}>
                          {typeBadge(leadPost).label}
                        </span>
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Read</span>
                      </div>
                      <h2 className="mb-1.5 line-clamp-2 font-display text-[17px] font-semibold leading-snug text-ink">
                        {postHeadline(leadPost)}
                      </h2>
                      <p className="text-[11px] text-ink-muted">
                        {authorLine(leadPost).name}
                        {authorLine(leadPost).university ? ` / ${authorLine(leadPost).university}` : ""}
                      </p>
                    </div>
                  </LandingTrackedLink>

                  {/* Compact rail items */}
                  {railPosts.map((post, i) => {
                    const badge  = typeBadge(post);
                    const author = authorLine(post);
                    return (
                      <LandingTrackedLink
                        key={post.id}
                        href={`/post/${post.slug}`}
                        event="landing_read_clicked"
                        metadata={{ source: "hero_rail", postId: post.id, position: `rail_${i + 1}` }}
                        className="hero-compact mb-1.5 last:mb-0 flex items-center gap-3 rounded-[10px] border border-gray-200 bg-canvas px-3 py-2.5"
                      >
                        <span className={`inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.classes}`}>
                          {badge.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{postHeadline(post)}</p>
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {author.name}{author.university ? ` · ${author.university}` : ""}
                          </p>
                        </div>
                      </LandingTrackedLink>
                    );
                  })}
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 p-5">
                  <p className="text-sm font-semibold text-gray-900">Browse latest ideas</p>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                    Read as a guest, then sign up when you want to follow writers or respond.
                  </p>
                  <LandingTrackedLink
                    href="/?guest=1"
                    event="landing_read_clicked"
                    metadata={{ source: "rail_empty" }}
                    className="mt-4 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-[#0E4B37]"
                  >
                    Browse latest
                  </LandingTrackedLink>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────────── */}
      <div id="stats-bar" className="border-b border-gray-200 bg-white py-4 sm:py-5">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-y-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:divide-x sm:divide-gray-200">
            {stats.map(({ value, suffix, label }) => (
              <div key={label} className="stat-item px-3 py-1 text-center sm:px-10">
                <div className="font-display text-[26px] font-bold tracking-[-0.02em] text-ink sm:text-[30px]" data-target={value}>
                  {value >= 1000 ? value.toLocaleString() : value}{suffix}
                </div>
                <div className="mx-auto mt-1 max-w-[9rem] text-[11px] font-medium leading-snug text-gray-500 sm:text-xs">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Latest posts ──────────────────────────────────────────── */}
      {gridPosts.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="section-head mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
                Real work, real bylines
              </p>
              <h2 className="font-display text-[28px] font-medium text-ink sm:text-[32px]">Latest from students</h2>
            </div>
            <LandingTrackedLink
              href="/?guest=1"
              event="landing_read_clicked"
              metadata={{ source: "latest_browse_all" }}
              className="text-sm font-semibold text-emerald-600 hover:underline"
            >
              Browse all →
            </LandingTrackedLink>
          </div>

          <div id="post-grid" className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {gridPosts.map((post, i) => {
              const badge       = typeBadge(post);
              const author      = authorLine(post);
              const isWide      = i === 0;
              const displayTitle = getPostDisplayTitle(post);

              return (
                <LandingTrackedLink
                  key={post.id}
                  href={`/post/${post.slug}`}
                  event="landing_read_clicked"
                  metadata={{ source: "latest_grid", postId: post.id, position: `grid_${i + 1}` }}
                  className={`post-card block overflow-hidden rounded-xl border border-gray-200 bg-white ${isWide ? "md:col-span-2" : ""}`}
                >
                  {isWide ? (
                    <div className="grid md:grid-cols-[280px_1fr]">
                      <PostCover
                        src={post.cover_image_url}
                        alt={displayTitle}
                        type={post.type}
                        sizes="(max-width: 768px) 100vw, 280px"
                        className="h-[188px] border-b border-gray-100 md:h-full md:min-h-[240px] md:border-b-0 md:border-r"
                        imageClassName="object-cover"
                      />
                      <div className="flex flex-col justify-between p-5 sm:p-6">
                        <div>
                          <div className="mb-2.5 flex items-center">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.classes}`}>{badge.label}</span>
                          </div>
                          <h2 className="mb-2 line-clamp-3 font-display text-[20px] font-semibold leading-snug text-ink sm:text-[22px]">{postHeadline(post)}</h2>
                          {displayTitle && post.excerpt && (
                            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">{post.excerpt}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-ink-muted">
                          <span className="font-medium text-gray-700">{author.name}</span>
                          {author.university && <><span>·</span><span>{author.university}</span></>}
                          {post.published_at && <><span>·</span><span>{relativeDate(post.published_at)}</span></>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <PostCover
                        src={post.cover_image_url}
                        alt={displayTitle}
                        type={post.type}
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="h-[150px] border-b border-gray-100"
                        imageClassName="object-cover"
                      />
                      <div className="p-4">
                        <div className="mb-2.5">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge.classes}`}>{badge.label}</span>
                        </div>
                        <h2 className="mb-2 line-clamp-2 font-display text-[17px] font-semibold leading-snug text-ink">{postHeadline(post)}</h2>
                        {displayTitle && post.excerpt && (
                          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-ink-muted">{post.excerpt}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 text-xs text-ink-muted">
                          <span className="font-medium text-gray-700">{author.name}</span>
                          {author.university && <><span>·</span><span>{author.university}</span></>}
                          {post.published_at && <><span>·</span><span>{relativeDate(post.published_at)}</span></>}
                        </div>
                      </div>
                    </>
                  )}
                </LandingTrackedLink>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Topics ────────────────────────────────────────────────── */}
      {topics.length > 0 && (
        <section className="border-y border-gray-200 bg-white py-12 sm:py-14">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="section-head mb-6 flex items-end justify-between">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">Browse by topic</p>
                <h2 className="font-display text-[24px] font-medium text-ink sm:text-[26px]">Find ideas that interest you</h2>
              </div>
            </div>
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div id="topics-grid" className="flex w-max gap-2.5 sm:w-auto sm:flex-wrap">
              {topics.map(({ tag, count }) => (
                <LandingTrackedLink
                  key={tag}
                  href={`/topics/${encodeURIComponent(tag)}`}
                  event="landing_read_clicked"
                  metadata={{ source: "topics_grid", topic: tag }}
                  className="topic-pill inline-flex min-h-9 shrink-0 cursor-pointer items-center rounded-full border border-gray-200 bg-white px-4 py-1.5 text-[13px] font-medium text-gray-700 transition-[border-color,background-color,color,box-shadow] duration-150 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-brand focus-visible:ring-offset-1"
                >
                  {tag}
                  <span className="ml-1.5 text-[11px] text-ink-muted">{count}</span>
                </LandingTrackedLink>
              ))}
            </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Debates ───────────────────────────────────────────────── */}
      <section className="border-b border-gray-200 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">

            {/* Copy */}
            <div id="debates-copy">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Live feature</span>
              </div>
              <h2 className="mb-4 font-display text-[32px] font-medium leading-[1.1] text-ink sm:text-[40px]">
                Argue the motion.<br />Move the debate.
              </h2>
              <p className="mb-7 max-w-[420px] text-base leading-[1.7] text-ink-muted">
                Structured academic debates run in live rounds. Make your argument for or against,
                have it upvoted by readers, and engage with counterpoints in real time.
              </p>
              <LandingTrackedLink
                href="/debates"
                event="landing_read_clicked"
                metadata={{ source: "debates_section" }}
                className="inline-flex items-center rounded-[10px] bg-emerald-brand px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#0E4B37]"
              >
                View active debates
              </LandingTrackedLink>
            </div>

            {/* Cards */}
            <div id="debates-cards" className="flex flex-col gap-3">
              {/* Active */}
              <div className="debate-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-canvas p-5">
                <div className="flex items-center gap-1.5">
                  <span className="debate-dot-live h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-brand" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-emerald-600">
                    Active · 142 arguments
                  </span>
                </div>
                <p className="font-display text-[18px] font-semibold leading-snug text-ink">
                  Should African universities adopt English-only instruction policies?
                </p>
                <div>
                  <div id="stance-bar" className="flex h-[5px] overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="stance-for h-full rounded-full bg-emerald-brand"
                      style={{ "--for-w": "58%" } as React.CSSProperties}
                    />
                    <div
                      className="stance-against h-full rounded-full bg-purple-500"
                      style={{ "--against-w": "42%" } as React.CSSProperties}
                    />
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-[11px] font-medium text-emerald-600">For · 58%</span>
                    <span className="text-[11px] font-medium text-purple-600">Against · 42%</span>
                  </div>
                </div>
                <div>
                  <LandingTrackedLink
                    href="/debates"
                    event="landing_read_clicked"
                    metadata={{ source: "debate_active" }}
                    className="inline-flex items-center rounded-lg bg-emerald-brand px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#0E4B37]"
                  >
                    Join debate
                  </LandingTrackedLink>
                </div>
              </div>

              {/* Open */}
              <div className="debate-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-canvas p-5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-amber-700">
                    Open for arguments
                  </span>
                </div>
                <p className="font-display text-[18px] font-semibold leading-snug text-ink">
                  Is IMF conditionality still a legitimate development tool in Africa?
                </p>
                <p className="text-xs text-ink-muted">Opening round · submissions open this week</p>
              </div>

              {/* Closed */}
              <div className="debate-card flex flex-col gap-3 rounded-xl border border-gray-200 bg-canvas p-5 opacity-70">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-gray-400" />
                  <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-gray-500">
                    Closed · Recap available
                  </span>
                </div>
                <p className="font-display text-[18px] font-semibold leading-snug text-ink">
                  Should African nations create a unified continental currency?
                </p>
                <p className="text-xs text-ink-muted">234 arguments · Majority: Against</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value props ───────────────────────────────────────────── */}
      <section className="border-b border-gray-200 bg-white py-12 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">How it works</p>
            <h2 className="font-display text-[30px] font-medium text-ink sm:text-[36px]">Built for intellectual seriousness</h2>
          </div>
          <div id="value-grid" className="grid grid-cols-1 divide-y md:grid-cols-3 md:divide-x md:divide-y-0 divide-gray-200">
            {VALUE_PROPS.map(({ num, numStyle, title, desc }, i) => (
              <div
                key={num}
                className={`value-item py-10 ${i === 0 ? "md:pr-10" : i === 1 ? "md:px-10" : "md:pl-10"}`}
              >
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${numStyle}`}>
                  <span className="font-display text-[28px] font-bold leading-none">{num}</span>
                </div>
                <h3 className="mb-2.5 text-[18px] font-semibold text-ink">{title}</h3>
                <p className="text-sm leading-[1.7] text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dual CTA ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div id="dual-cta" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="cta-card rounded-2xl bg-gray-900 px-6 py-8 text-white sm:px-10 sm:py-11">
            <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.18em] opacity-65">For readers</p>
            <h2 className="mb-3 font-display text-[30px] font-medium leading-[1.1]">
              Start exploring student ideas today
            </h2>
            <p className="mb-7 text-[15px] leading-relaxed opacity-80">
              No account needed to read. Browse essays, research, and policy briefs from students
              at 142 African universities.
            </p>
            <LandingTrackedLink
              href="/?guest=1"
              event="landing_read_clicked"
              metadata={{ source: "dual_cta_readers" }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-emerald-brand px-7 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#0E4B37]"
            >
              Browse as guest
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </LandingTrackedLink>
          </div>

          <div className="cta-card rounded-2xl bg-emerald-brand px-6 py-8 text-white sm:px-10 sm:py-11">
            <p className="mb-3.5 text-[11px] font-bold uppercase tracking-[0.18em] opacity-65">For writers</p>
            <h2 className="mb-3 font-display text-[30px] font-medium leading-[1.1]">
              Publish your research and build your profile
            </h2>
            <p className="mb-7 text-[15px] leading-relaxed opacity-80">
              Claim your handle, complete your student profile, and start with a Quick Take.
              Essays and research papers earn points toward your Scholar tier.
            </p>
            <LandingTrackedLink
              href="/signup"
              event="landing_signup_clicked"
              metadata={{ source: "dual_cta_writers" }}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-white px-7 py-3 text-[15px] font-medium text-emerald-600 transition-colors hover:bg-emerald-50"
            >
              Claim your handle
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </LandingTrackedLink>
          </div>
        </div>
      </section>

      <Footer landing />
    </div>
  );
}
