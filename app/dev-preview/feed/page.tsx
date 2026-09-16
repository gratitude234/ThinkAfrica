import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import HomeFeedCard from "@/components/post/HomeFeedCard";
import { EndStateCard, HomeFeedEmptyState } from "@/app/(main)/PostsFeedTabs";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import {
  ARTICLE_FIXTURES,
  POST_FIXTURES,
  type FixtureCard,
} from "@/lib/devFixtures/homeFeedFixtures";

export const metadata: Metadata = {
  title: "Feed preview (dev only)",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "posts", label: "Posts" },
  { id: "articles", label: "Articles" },
  { id: "states", label: "States" },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-gray-200 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
      {note ? <p className="mt-1.5 max-w-[720px] text-sm text-gray-500">{note}</p> : null}
      <div className="mt-6 space-y-8">{children}</div>
    </section>
  );
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">{label}</p>
      <div className="mx-auto max-w-[720px]">{children}</div>
    </div>
  );
}

function FixtureCardRow({ fixture }: { fixture: FixtureCard }) {
  return (
    <Frame label={fixture.caption}>
      {/* currentUserId is always null in this harness -- see the module doc
          comment on FeedPreviewPage for why that's a safety requirement, not a
          limitation of the demo. */}
      <HomeFeedCard post={fixture.post} currentUserId={null} />
    </Frame>
  );
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {children}
    </div>
  );
}

/**
 * Development-only visual fixture harness for the Home feed: Post and Article
 * cards, and the feed's loading, error, empty and caught-up states. It mirrors
 * Home after the publishing reset, Phase 2F, so it has no featured lead,
 * sidebar, interlude or banner sections.
 *
 * Safety:
 *  - Gated to notFound() outside development -- never reachable in a
 *    production build/deploy.
 *  - Renders entirely from the static fixtures in
 *    lib/devFixtures/homeFeedFixtures.ts -- no Supabase reads or writes,
 *    no /api/feed calls, no auth dependency.
 *  - Every card is rendered with currentUserId={null} on purpose: the real
 *    Like/Save controls are the actual production components (for visual
 *    fidelity), and with a null viewer id their click handlers only ever open
 *    the guest sign-in gate (GuestAuthGateProvider, mounted once in the root
 *    layout) -- never a server action against real data. "Authenticated"
 *    engagement states are simulated with pre-set viewer_liked /
 *    viewer_bookmarked fixture flags instead of a real session.
 *  - Cards are rendered via HomeFeedCard directly, not the impression wrapper,
 *    so scrolling this page never fires the real impression beacon for a
 *    fixture slug.
 */
export default function FeedPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[960px] px-6 py-8">
      <header className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-red-600">Development only -- not reachable in production</p>
        <h1 className="font-display mt-1 text-3xl font-semibold text-ink">Home feed visual preview</h1>
        <p className="mt-2 max-w-[720px] text-sm text-gray-600">
          Deterministic fixtures for every Post and Article card variant and the feed states. Resize the
          window or use your browser&apos;s device toolbar to check 360×800, 390×844, 430×932, 768×1024,
          1280×800, and 1440×900.
        </p>
        <nav aria-label="Jump to section" className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="font-semibold text-emerald-700 hover:underline">
              {section.label}
            </a>
          ))}
        </nav>
      </header>

      <Section id="posts" title="Posts" note="Author-first, titleless by default -- no fabricated heading, no reading time.">
        {POST_FIXTURES.map((fixture) => (
          <FixtureCardRow key={fixture.id} fixture={fixture} />
        ))}
      </Section>

      <Section id="articles" title="Articles" note="A title makes a piece an Article. There is no genre under it and no second axis to filter on.">
        {ARTICLE_FIXTURES.map((fixture) => (
          <FixtureCardRow key={fixture.id} fixture={fixture} />
        ))}
      </Section>

      <Section id="states" title="Feed states">
        <Frame label="Loading">
          <FeedSkeleton />
        </Frame>

        <Frame label="Initial load error">
          <ErrorBanner>Failed to load feed</ErrorBanner>
        </Frame>

        <Frame label="Pagination error (feed already has content -- error appears below it, not in place of it)">
          <div className="space-y-3">
            <HomeFeedCard post={POST_FIXTURES[0].post} currentUserId={null} />
            <ErrorBanner>Failed to load feed</ErrorBanner>
          </div>
        </Frame>

        <Frame label="Empty For You">
          <HomeFeedEmptyState tab="home" />
        </Frame>

        <Frame label="Empty Following">
          <HomeFeedEmptyState tab="following" />
        </Frame>

        <Frame label="Caught up (pagination exhausted)">
          <EndStateCard />
        </Frame>
      </Section>
    </div>
  );
}
