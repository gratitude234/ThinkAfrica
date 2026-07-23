import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import HomeFeedCard from "@/components/post/HomeFeedCard";
import HomeFeaturedLead from "@/components/post/HomeFeaturedLead";
import HomeSidebar from "@/components/ui/HomeSidebar";
import PostFeed from "@/components/post/PostFeed";
import DebateInterlude from "@/components/post/DebateInterlude";
import PeopleInterlude from "@/components/post/PeopleInterlude";
import TopicInterlude from "@/components/post/TopicInterlude";
import { EndStateCard } from "@/app/(main)/PostsFeedTabs";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import {
  ACTIVATION_FALLBACK_FIXTURE,
  ARTICLE_FIXTURES,
  DEBATE_FIXTURE,
  FEATURED_FIXTURE,
  FEATURED_TODAY_FIXTURE,
  POST_FIXTURES,
  RECENT_DRAFT_FIXTURE,
  RESEARCH_FIXTURES,
  SURFACE_REASON_FIXTURE,
  TOPIC_FIXTURES,
  TOPIC_INTERLUDE_POSTS,
  WRITER_FIXTURES,
  type FixtureCard,
} from "@/lib/devFixtures/homeFeedFixtures";

export const metadata: Metadata = {
  title: "Feed preview (dev only)",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "posts", label: "Posts" },
  { id: "articles", label: "Articles" },
  { id: "research", label: "Research" },
  { id: "featured-rail", label: "Featured & rail" },
  { id: "interludes", label: "Discovery interludes" },
  { id: "states", label: "States" },
];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-gray-200 py-10 first:border-t-0 first:pt-0">
      <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
      {note ? <p className="mt-1.5 max-w-[680px] text-sm text-gray-500">{note}</p> : null}
      <div className="mt-6 space-y-8">{children}</div>
    </section>
  );
}

function FixtureCardRow({ fixture }: { fixture: FixtureCard }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">{fixture.caption}</p>
      <div className="mx-auto max-w-[680px]">
        {/* currentUserId is always null in this harness -- see the module
            doc comment on FeedPreviewPage for why that's a safety
            requirement, not a limitation of the demo. */}
        <HomeFeedCard post={fixture.post} currentUserId={null} surface="home" />
      </div>
    </div>
  );
}

function RailFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">{label}</p>
      <div className="w-[304px] rounded-lg border border-dashed border-gray-300 p-3">{children}</div>
    </div>
  );
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[680px] rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {children}
    </div>
  );
}

/**
 * Development-only visual fixture harness for the Home feed cards (Post /
 * Article / Research / featured / rail / caught-up / error / loading /
 * empty states). See docs on this pass for the full requirement list.
 *
 * Safety:
 *  - Gated to notFound() outside development -- never reachable in a
 *    production build/deploy.
 *  - Renders entirely from the static fixtures in
 *    lib/devFixtures/homeFeedFixtures.ts -- no Supabase reads or writes,
 *    no /api/feed calls, no auth dependency.
 *  - Every card is rendered with currentUserId={null} on purpose: the real
 *    Like/Save/Follow controls are the actual production components (for
 *    visual fidelity), and with a null viewer id their click handlers only
 *    ever open the guest sign-in gate (GuestAuthGateProvider, mounted once
 *    in the root layout) -- never a server action against real data.
 *    "Authenticated" engagement states are simulated with pre-set
 *    viewer_liked/viewer_bookmarked fixture flags instead of a real
 *    session, so this page can never write fixture data to Supabase no
 *    matter what a visitor clicks.
 *  - Cards are rendered via HomeFeedCard directly, not
 *    HomeFeedCardImpression/PostFeed's impression wrapper, so scrolling
 *    this page never fires the real /api/posts/[slug]/impression beacon
 *    for a fixture slug.
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
        <p className="mt-2 max-w-[680px] text-sm text-gray-600">
          Deterministic fixtures for every Post/Article/Research card variant, the featured lead, the desktop
          rail, discovery interludes, and feed states. Resize the window or use your browser&apos;s device
          toolbar to check 360×800, 390×844, 430×932, 768×1024, 1280×800, and 1440×900.
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
        <FixtureCardRow fixture={SURFACE_REASON_FIXTURE} />
      </Section>

      <Section id="articles" title="Articles" note="Genre (Essay / Policy Brief) is quiet metadata under the title, never a top-level filter.">
        {ARTICLE_FIXTURES.map((fixture) => (
          <FixtureCardRow key={fixture.id} fixture={fixture} />
        ))}
      </Section>

      <Section
        id="research"
        title="Research"
        note="Metadata-first, no boxed PDF sub-card. At most one evidence badge (Citable beats Reviewed). Page counts are omitted -- they aren't in the current document data contract, so this harness never fabricates one."
      >
        {RESEARCH_FIXTURES.map((fixture) => (
          <FixtureCardRow key={fixture.id} fixture={fixture} />
        ))}
      </Section>

      <Section id="featured-rail" title="Featured & rail">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Editor&apos;s Pick (featured lead)</p>
          <div className="mx-auto max-w-[680px]">
            <HomeFeaturedLead post={FEATURED_FIXTURE} />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <RailFrame label="Full rail (all four cards + topics)">
            <HomeSidebar
              activeDebate={DEBATE_FIXTURE}
              recentDraft={RECENT_DRAFT_FIXTURE}
              activationState={null}
              featuredToday={FEATURED_TODAY_FIXTURE}
              peopleSuggestions={WRITER_FIXTURES}
              currentUserId={null}
              topics={TOPIC_FIXTURES}
            />
          </RailFrame>

          <RailFrame label="Personal action: incomplete activation fallback (no draft)">
            <HomeSidebar
              activeDebate={null}
              recentDraft={null}
              activationState={ACTIVATION_FALLBACK_FIXTURE}
              featuredToday={null}
              peopleSuggestions={[]}
              currentUserId={null}
              topics={[]}
            />
          </RailFrame>

          <RailFrame label="Missing optional sections (topics only)">
            <HomeSidebar
              activeDebate={null}
              recentDraft={null}
              activationState={null}
              featuredToday={null}
              peopleSuggestions={[]}
              currentUserId={null}
              topics={TOPIC_FIXTURES}
            />
          </RailFrame>
        </div>
      </Section>

      <Section
        id="interludes"
        title="Discovery interludes"
        note="Rendered directly (not through the impression-tracking feed list) -- For You/Discover only, at most one per eight items, each module at most once per load."
      >
        <div className="mx-auto max-w-[680px]">
          <DebateInterlude debate={DEBATE_FIXTURE} />
        </div>
        <div className="mx-auto max-w-[680px]">
          <PeopleInterlude people={WRITER_FIXTURES.slice(0, 3)} reason="Based on your reading history" currentUserId={null} />
        </div>
        <div className="mx-auto max-w-[680px]">
          <TopicInterlude posts={TOPIC_INTERLUDE_POSTS} />
        </div>
      </Section>

      <Section id="states" title="Feed states">
        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Loading</p>
          <div className="mx-auto max-w-[680px]">
            <FeedSkeleton />
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Initial load error</p>
          <ErrorBanner>Failed to load feed</ErrorBanner>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">
            Pagination error (feed already has content -- error appears below it, not in place of it)
          </p>
          <div className="mx-auto max-w-[680px] space-y-3">
            <HomeFeedCard post={POST_FIXTURES[0].post} currentUserId={null} surface="home" />
            <ErrorBanner>Failed to load feed</ErrorBanner>
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Empty default/filtered feed</p>
          <div className="mx-auto max-w-[680px]">
            <PostFeed posts={[]} activeTab="home" />
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Empty Following feed</p>
          <div className="mx-auto max-w-[680px]">
            <PostFeed posts={[]} activeTab="following" />
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-purple-accent">Caught up (pagination exhausted)</p>
          <div className="mx-auto max-w-[680px]">
            <EndStateCard />
          </div>
        </div>
      </Section>
    </div>
  );
}
