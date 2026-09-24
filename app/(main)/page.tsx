import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import PostsFeedSection from "./PostsFeedSection";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";
import { BRAND_PROMISE, BRAND_SEO_DESCRIPTION } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Home",
  description: BRAND_SEO_DESCRIPTION,
  alternates: { canonical: canonicalPath("/landing") },
  openGraph: {
    title: `Indegenius | ${BRAND_PROMISE}`,
    description: BRAND_SEO_DESCRIPTION,
    url: absoluteUrl("/landing"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Indegenius | ${BRAND_PROMISE}`,
    description: BRAND_SEO_DESCRIPTION,
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{
    guest?: string;
    tab?: string;
    type?: string;
    timeframe?: string;
    source?: string;
    welcome?: string;
  }>;
}

/**
 * Home: the publication feed, and nothing else.
 *
 * Two modes, For You and Following, and a list of Posts and Articles. The
 * publishing reset (Phase 2F) removed the sidebar brief, the featured lead,
 * the people and topic interludes, the welcome and push-permission banners,
 * and the activation and retention cards, along with every query that fed
 * them. This page reads only the session; the feed's own reads happen inside
 * the Suspense boundary, in PostsFeedSection.
 */
export default async function HomePage({ searchParams }: PageProps) {
  const { guest, tab, type, timeframe, source, welcome } = await searchParams;
  const supabase = await createClient();

  const claimsResult = await supabase.auth.getClaims();
  const claims = claimsResult.data?.claims ?? null;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  if (!userId && guest !== "1") {
    redirect("/landing");
  }

  // Content-kind filtering lives on Explore. Hand old `/?type=` links over
  // rather than honouring an invisible filter Home has no control to clear.
  // The raw value is passed through untouched because Explore reads the same
  // names and maps the pre-content-model ones that may sit in bookmarks.
  if (type && type !== "all") {
    redirect(`/explore?type=${encodeURIComponent(type)}`);
  }

  const activeTab = userId && tab === "following" ? "following" : "home";

  // Older addresses carry parameters Home no longer reads: a timeframe, a
  // subscription source, the retired welcome flag, or a retired tab (Latest,
  // Subscribed, Topics). Canonicalize them so the address describes the feed
  // on screen, keeping only guest context and the Following tab.
  const tabIsCanonical =
    tab === undefined || tab === "home" || tab === activeTab;
  if (
    !tabIsCanonical ||
    timeframe !== undefined ||
    source !== undefined ||
    welcome !== undefined
  ) {
    const canonical = new URLSearchParams();
    if (guest === "1") canonical.set("guest", "1");
    if (activeTab === "following") canonical.set("tab", "following");
    const query = canonical.toString();
    redirect(query ? `/?${query}` : "/");
  }

  return (
    <div className="mx-auto w-full max-w-[704px]">
      {userId ? (
        <RetentionEventTracker event="home_viewed" metadata={{ tab: activeTab }} />
      ) : null}

      <Suspense fallback={<FeedSkeleton />}>
        <PostsFeedSection tab={activeTab} userId={userId} />
      </Suspense>
    </div>
  );
}
