import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Footer from "@/components/ui/Footer";

type SamplePostCard = {
  id: string;
  title: string;
  slug: string;
  type: string;
  cover_image_url: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
  } | null;
};

type PlaceholderCard = {
  title: string;
  subtitle: string;
  summary: string;
};

const PLACEHOLDER_CARDS: PlaceholderCard[] = [
  {
    title: "Featured this week",
    subtitle: "Youth unemployment",
    summary:
      "Essays and policy writing on jobs, skills, and what growth should look like for young Africans.",
  },
  {
    title: "Featured this week",
    subtitle: "AfCFTA and trade",
    summary:
      "Student perspectives on regional trade, industrial policy, and what integration means beyond headlines.",
  },
  {
    title: "Featured this week",
    subtitle: "Climate adaptation",
    summary:
      "Research and commentary on resilience, agriculture, and the policies shaping climate futures across the continent.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();

  const [
    { data: samplePostsRaw },
    { count: postCount },
    { count: userCount },
    { count: debateCount },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        `id, title, slug, type, cover_image_url,
        profiles!posts_author_id_fkey (username, full_name, university)`
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(3),
    supabase
      .from("posts")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("debates").select("*", { count: "exact", head: true }),
  ]);

  const samplePosts: SamplePostCard[] = (samplePostsRaw ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const features = [
    {
      title: "Publish",
      description:
        "Essays, research, and policy briefs - long-form writing that builds a real portfolio, not a feed of hot takes.",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-700",
      numeral: "01",
    },
    {
      title: "Be discovered",
      description:
        "Your profile is your academic résumé. Verified by your university, visible to fellowships and recruiters across the continent.",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-700",
      numeral: "02",
    },
    {
      title: "Think together",
      description:
        "Read, annotate, and respond to the writers shaping Africa's next decade - from students at every university.",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-700",
      numeral: "03",
    },
  ];

  const heroCards = [...samplePosts, ...PLACEHOLDER_CARDS].slice(0, 3);

  return (
    <div>
      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
          <div>
            <Image
              src="/logo.png"
              alt="ThinkAfrika"
              width={180}
              height={48}
              className="mb-6 h-12 w-auto"
            />
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Where Africa&apos;s next thinkers are read.
            </h1>
            <p className="mb-8 mt-4 text-lg text-ink-muted sm:text-xl">
              Publish essays, research, and policy briefs alongside students from
              every African university. Build a verified academic profile that
              travels with you - to fellowships, to grad school, to the
              continent&apos;s most important conversations.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/?guest=1"
                className="rounded-xl bg-emerald-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Read First
              </Link>
              <Link
                href="/signup"
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-canvas"
              >
                Join Free
              </Link>
            </div>
          </div>

          <div className="max-h-80 overflow-hidden md:max-h-none">
            <div className="space-y-3">
              {heroCards.map((item, index) => {
                if ("id" in item) {
                  const author = item.profiles;

                  return (
                    <Link
                      key={item.id}
                      href={`/post/${item.slug}`}
                      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="min-w-0 flex-1">
                        <Badge type={item.type} />
                        <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-gray-900">
                          {item.title}
                        </h2>
                        <p className="mt-2 text-xs text-gray-400">
                          {author?.full_name ?? author?.username ?? "ThinkAfrika"}
                          {author?.university ? ` · ${author.university}` : ""}
                        </p>
                      </div>
                      {item.cover_image_url ? (
                        <Image
                          src={item.cover_image_url}
                          alt={item.title}
                          width={64}
                          height={64}
                          className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-canvas text-xs font-semibold uppercase tracking-wide text-emerald-brand">
                          Read
                        </div>
                      )}
                    </Link>
                  );
                }

                return (
                  <div
                    key={`${item.title}-${index}`}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
                      {item.title}
                    </p>
                    <h2 className="mt-3 text-xl font-semibold text-gray-900">
                      {item.subtitle}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      {item.summary}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {(userCount ?? 0) >= 20 ? (
        <section className="border-y border-gray-100 bg-white py-6">
          <div className="mx-auto max-w-5xl px-4">
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-ink-muted">
              Writers from
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-gray-500">
              <span>University of Ibadan</span>
              <span>Ashesi University</span>
              <span>Makerere University</span>
              <span>Joseph Ayo Babalola University</span>
              <span>University of Cape Town</span>
              <span>Cairo University</span>
              <span>Strathmore University</span>
              <span>University of Lagos</span>
            </div>
          </div>
        </section>
      ) : null}

      {(postCount ?? 0) >= 100 && (userCount ?? 0) >= 50 ? (
        <section className="border-y border-gray-100 bg-canvas py-8">
          <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 text-center sm:grid-cols-3">
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
              <p className="text-sm text-gray-500">Students</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {(debateCount ?? 0).toLocaleString()}+
              </p>
              <p className="text-sm text-gray-500">Debates</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-16">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${feature.iconBg} ${feature.iconColor}`}
              >
                <span className="font-display text-4xl leading-none">
                  {feature.numeral}
                </span>
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 rounded-2xl bg-emerald-brand p-10 text-center text-white">
        <p className="mb-6 text-xl font-semibold">
          A continent of ideas is waiting to read you.
        </p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-white px-6 py-3 font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          Claim your handle →
        </Link>
      </section>

      <Footer />
    </div>
  );
}
