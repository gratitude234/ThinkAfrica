import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import Footer from "@/components/ui/Footer";

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

  const samplePosts = (samplePostsRaw ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const features = [
    {
      title: "Publish",
      description:
        "Share blogs, essays, research papers, and policy briefs with Africa's academic community.",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-700",
      icon: (
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 3.5l4 4M5 19l3.5-.5L20 7 16 3 4.5 14.5 4 18z"
          />
        </svg>
      ),
    },
    {
      title: "Debate",
      description:
        "Engage in structured intellectual debates on the most pressing issues facing Africa today.",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-700",
      icon: (
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      ),
    },
    {
      title: "Grow",
      description:
        "Climb the leaderboard, earn badges, and unlock fellowships as you contribute to the community.",
      iconBg: "bg-purple-100",
      iconColor: "text-purple-700",
      icon: (
        <svg
          className="h-7 w-7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"
          />
        </svg>
      ),
    },
  ];

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
            <h1 className="text-4xl font-bold leading-tight text-gray-900 sm:text-5xl">
              Africa&apos;s intellectual social network
            </h1>
            <p className="mt-4 mb-8 text-lg text-gray-500">
              Publish research, debate ideas, and build your academic profile -
              built for African university students.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-emerald-brand px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                Start Writing
              </Link>
              <Link
                href="/?guest=1"
                className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Explore the Feed
              </Link>
            </div>
          </div>

          <div className="max-h-80 overflow-hidden md:max-h-none">
            <div className="space-y-3">
              {samplePosts.map((post) => {
                const author = post.profiles;

                return (
                  <Link
                    key={post.id}
                    href={`/post/${post.slug}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <Badge type={post.type} />
                      <h2 className="mt-3 line-clamp-2 text-sm font-semibold text-gray-900">
                        {post.title}
                      </h2>
                      <p className="mt-2 text-xs text-gray-400">
                        {author?.full_name ?? author?.username ?? "ThinkAfrica"}
                        {author?.university ? ` · ${author.university}` : ""}
                      </p>
                    </div>
                    {post.cover_image_url ? (
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-100 bg-gray-50 py-8">
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

      <section className="py-16">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="text-center">
              <div
                className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${feature.iconBg} ${feature.iconColor}`}
              >
                {feature.icon}
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
          Join thousands of African students already thinking out loud.
        </p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-white px-6 py-3 font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
        >
          Join ThinkAfrica Free
        </Link>
      </section>

      <Footer />
    </div>
  );
}
