import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Footer from "@/components/ui/Footer";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import LandingTrackedLink from "./LandingTrackedLink";

type LandingPost = {
  id: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string | null;
  cover_image_url: string | null;
  view_count: number | null;
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

const valueProps = [
  {
    title: "Find serious student ideas",
    description:
      "Read essays, research, and policy briefs from students writing beyond the quick-take feed.",
    numeral: "01",
    styles: "bg-emerald-100 text-emerald-700",
  },
  {
    title: "Follow credible writers",
    description:
      "Use author profiles, universities, and fields of study to decide whose work is worth tracking.",
    numeral: "02",
    styles: "bg-amber-100 text-amber-700",
  },
  {
    title: "Respond thoughtfully",
    description:
      "Move from reading into questions, counterpoints, and response posts that build the conversation.",
    numeral: "03",
    styles: "bg-purple-100 text-purple-700",
  },
];

function authorLine(post: LandingPost) {
  const author = post.profiles;
  const name = author?.full_name ?? author?.username ?? "ThinkAfrika";
  return author?.university ? `${name} / ${author.university}` : name;
}

function readHref(post: LandingPost | null) {
  return post ? `/post/${post.slug}` : "/?guest=1";
}

function ReadCard({
  post,
  position,
  variant = "compact",
}: {
  post: LandingPost;
  position: string;
  variant?: "lead" | "compact";
}) {
  const isLead = variant === "lead";

  return (
    <LandingTrackedLink
      href={`/post/${post.slug}`}
      event="landing_read_clicked"
      metadata={{
        source: "landing",
        postId: post.id,
        postType: post.type,
        position,
      }}
      className={`group block rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md ${
        isLead ? "overflow-hidden" : "p-4"
      }`}
    >
      {isLead && post.cover_image_url ? (
        <div className="relative aspect-[16/9] overflow-hidden border-b border-gray-100">
          <Image
            src={post.cover_image_url}
            alt={post.title}
            fill
            sizes="(max-width: 768px) 100vw, 520px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>
      ) : null}

      <div className={isLead ? "p-5" : ""}>
        <div className="flex items-center justify-between gap-3">
          <Badge type={post.type} />
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            Read
          </span>
        </div>
        <h2
          className={`mt-3 font-semibold leading-snug text-gray-950 ${
            isLead ? "text-xl sm:text-2xl" : "line-clamp-2 text-sm"
          }`}
        >
          {post.title}
        </h2>
        {isLead && post.excerpt ? (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-gray-500">
            {post.excerpt}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-gray-500">{authorLine(post)}</p>
      </div>
    </LandingTrackedLink>
  );
}

function BrowseFallback({ source }: { source: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-5">
      <p className="text-sm font-semibold text-gray-900">Browse latest ideas</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        Read as a guest, then sign up when you want to follow writers, save posts,
        or respond.
      </p>
      <LandingTrackedLink
        href="/?guest=1"
        event="landing_read_clicked"
        metadata={{ source, position: "fallback" }}
        className="mt-4 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
      >
        Browse latest
      </LandingTrackedLink>
    </div>
  );
}

export default async function LandingPage() {
  const supabase = await createClient();

  const [{ data: postsRaw }, { count: postCount }, { count: userCount }] =
    await Promise.all([
      supabase
        .from("posts")
        .select(
          `id, title, slug, type, excerpt, cover_image_url, view_count, featured,
          profiles!posts_author_id_fkey (username, full_name, university)`
        )
        .eq("status", "published")
        .order("featured", { ascending: false })
        .order("view_count", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(6),
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("status", "published"),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
    ]);

  const posts: LandingPost[] = ((postsRaw ?? []) as LandingPostRaw[]).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
  }));

  const [leadPost = null, ...supportingPosts] = posts;
  const primaryReadHref = readHref(leadPost);
  const showStats = (postCount ?? 0) >= 100 && (userCount ?? 0) >= 50;

  return (
    <div>
      <RetentionEventTracker
        event="landing_viewed"
        metadata={{
          source: "landing",
          postCount: postCount ?? 0,
          visiblePosts: posts.length,
        }}
      />

      <section className="px-4 pb-10 pt-10 sm:pt-14 lg:pb-14">
        <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
              Student essays, research, and policy briefs
            </p>
            <h1 className="font-display text-5xl leading-[1.02] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Read Africa&apos;s next thinkers.
            </h1>
            <p className="mb-7 mt-5 max-w-xl text-lg leading-relaxed text-ink-muted sm:text-xl">
              Discover serious writing from students across African universities.
              Read first, then follow credible writers, save posts, and build a
              verified academic profile when you are ready.
            </p>
            <div className="flex flex-wrap gap-3">
              <LandingTrackedLink
                href={primaryReadHref}
                event="landing_read_clicked"
                metadata={{
                  source: "hero_primary",
                  postId: leadPost?.id ?? null,
                  postType: leadPost?.type ?? null,
                  position: "primary",
                }}
                className="rounded-xl bg-emerald-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Start reading
              </LandingTrackedLink>
              <LandingTrackedLink
                href="/signup"
                event="landing_signup_clicked"
                metadata={{ source: "hero_secondary" }}
                className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-canvas"
              >
                Join free
              </LandingTrackedLink>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-canvas p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-gray-900">Start reading</p>
              <LandingTrackedLink
                href="/?guest=1"
                event="landing_read_clicked"
                metadata={{ source: "start_reading_rail", position: "browse_all" }}
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                Browse all
              </LandingTrackedLink>
            </div>

            {leadPost ? (
              <div className="space-y-3">
                <ReadCard post={leadPost} position="lead" variant="lead" />
                {supportingPosts.slice(0, 3).map((post, index) => (
                  <ReadCard
                    key={post.id}
                    post={post}
                    position={`rail_${index + 1}`}
                  />
                ))}
                {supportingPosts.length < 2 ? (
                  <BrowseFallback source="thin_rail" />
                ) : null}
              </div>
            ) : (
              <BrowseFallback source="empty_rail" />
            )}
          </div>
        </div>
      </section>

      {posts.length > 0 ? (
        <section className="border-y border-gray-100 bg-white px-4 py-10">
          <div className="mx-auto max-w-6xl">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  Latest from students
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">
                  Real work, real bylines
                </h2>
              </div>
              <LandingTrackedLink
                href="/?guest=1"
                event="landing_read_clicked"
                metadata={{ source: "latest_section", position: "browse_all" }}
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Browse latest
              </LandingTrackedLink>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {posts.slice(0, 3).map((post, index) => (
                <ReadCard
                  key={post.id}
                  post={post}
                  position={`latest_${index + 1}`}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showStats ? (
        <section className="border-b border-gray-100 bg-canvas px-4 py-8">
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 text-center sm:grid-cols-2">
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(postCount ?? 0).toLocaleString()}+
              </p>
              <p className="text-sm text-gray-500">Published posts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(userCount ?? 0).toLocaleString()}+
              </p>
              <p className="text-sm text-gray-500">Student profiles</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
          {valueProps.map((feature) => (
            <div key={feature.title} className="text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${feature.styles}`}
              >
                <span className="font-display text-4xl leading-none">
                  {feature.numeral}
                </span>
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-gray-500">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mb-8 max-w-6xl px-4">
        <div className="rounded-xl bg-emerald-brand px-6 py-10 text-center text-white">
          <p className="text-xl font-semibold">Want to publish after reading?</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/85">
            Claim your handle, complete your profile, and start with a Quick Take
            when you are ready to contribute.
          </p>
          <LandingTrackedLink
            href="/signup"
            event="landing_signup_clicked"
            metadata={{ source: "publish_after_reading_cta" }}
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
          >
            Claim your handle
          </LandingTrackedLink>
        </div>
      </section>

      <Footer />
    </div>
  );
}
