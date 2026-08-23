import Link from "next/link";
import type { Metadata } from "next";
import PostCardImpression from "@/components/post/PostCardImpression";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import { fetchRecentResponsePage } from "@/lib/feedData";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

const DESCRIPTION =
  "Read published responses that engage directly with ideas on Indegenius, then add your own contribution to the discourse.";

export const metadata: Metadata = {
  title: "Responses",
  description: DESCRIPTION,
  alternates: { canonical: canonicalPath("/responses") },
  openGraph: {
    title: "Responses on Indegenius",
    description: DESCRIPTION,
    url: absoluteUrl("/responses"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Responses on Indegenius",
    description: DESCRIPTION,
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function ResponsesPage({ searchParams }: PageProps) {
  const { page: rawPage } = await searchParams;
  const page = parsePage(rawPage);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { cards, hasMore } = await fetchRecentResponsePage(
    supabase,
    user?.id ?? null,
    page
  );

  return (
    <div className="mx-auto max-w-5xl">
      <RetentionEventTracker
        event="discover_viewed"
        metadata={{ surface: "responses", page, signedIn: Boolean(user) }}
      />

      <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-black/[0.02] sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-brand">
          Responses
        </p>
        <h1 className="mt-2 max-w-3xl font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">
          Ideas become stronger when they meet another mind.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-[15px]">
          These are published contributions written directly in response to another idea.
          Each one links back to its source and becomes part of its author&apos;s Intellectual Record.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/explore"
            className="inline-flex min-h-11 items-center rounded-xl bg-emerald-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Find an idea to respond to
          </Link>
          <Link
            href="/write"
            className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-300 hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Publish a new idea
          </Link>
        </div>
      </section>

      {cards.length > 0 ? (
        <section aria-labelledby="recent-responses-title">
          <div className="mb-3">
            <h2 id="recent-responses-title" className="text-lg font-semibold text-ink">
              Recent responses
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Follow the context line on each contribution back to the idea it answers.
            </p>
          </div>
          <div>
            {cards.map((post) => (
              <PostCardImpression
                key={post.id}
                post={post}
                surface="responses"
                variant="standard"
              />
            ))}
          </div>

          <nav className="mt-6 flex items-center justify-between" aria-label="Responses pages">
            {page > 1 ? (
              <Link
                href={page === 2 ? "/responses" : `/responses?page=${page - 1}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-canvas"
              >
                Newer responses
              </Link>
            ) : (
              <span />
            )}
            {hasMore ? (
              <Link
                href={`/responses?page=${page + 1}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-canvas"
              >
                Older responses
              </Link>
            ) : null}
          </nav>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <h2 className="font-display text-xl font-semibold text-ink">
            No published responses here yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
            Discover an idea and use its Respond action to begin the first thread.
          </p>
          <Link
            href="/explore"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white"
          >
            Explore ideas
          </Link>
        </section>
      )}
    </div>
  );
}
