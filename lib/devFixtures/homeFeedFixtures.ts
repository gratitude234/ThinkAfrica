/**
 * Deterministic, development-only fixture data for the Home feed visual
 * preview harness (app/dev-preview/feed). Never imported by production
 * routes/components -- see that page for the notFound() gate.
 *
 * Every record here is a plain object conforming to the real card contract
 * (PostCardData). No `as any`, no partial shapes -- if a card's props change
 * shape, this file should fail to typecheck rather than silently drift out of
 * sync with the real contract.
 *
 * The featured lead, sidebar, activation, interlude, co-author and
 * surface-reason fixtures went with those modules in the publishing reset,
 * Phase 2F. The preview mirrors Home as it is: publication cards and states.
 */

import type { PostCardData } from "@/components/post/PostCard";

const COVER_EMERALD = "/dev-fixtures/cover-emerald.svg";
const COVER_GOLD = "/dev-fixtures/cover-gold.svg";

const NOW = new Date("2026-07-23T09:00:00.000Z");

function daysAgo(days: number, hours = 0) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - hours * 60 * 60 * 1000).toISOString();
}

type FixtureProfile = NonNullable<PostCardData["profiles"]>;

function profile(overrides: Partial<FixtureProfile> & { username: string; full_name: string }): FixtureProfile {
  return {
    university: null,
    avatar_url: null,
    verified: false,
    verified_type: null,
    ...overrides,
  };
}

// Realistic, named writer profiles, reused across sections so the same
// "person" can plausibly appear on more than one card.
const AMARA = profile({ username: "amara-nwosu", full_name: "Amara Nwosu" });
const KWAME = profile({ username: "kwame-boateng", full_name: "Kwame Boateng" });
const FATIMA = profile({ username: "fatima-diallo", full_name: "Fatima Diallo" });
const TENDAI = profile({ username: "tendai-moyo", full_name: "Tendai Moyo" });
const WANJIRU = profile({ username: "wanjiru-kamau", full_name: "Wanjiru Kamau" });
const NALEDI = profile({ username: "naledi-dlamini", full_name: "Naledi Dlamini" });
const YOHANNES = profile({ username: "yohannes-tesfaye", full_name: "Yohannes Tesfaye" });
const SENA = profile({ username: "sena-mensah", full_name: "Sena Mensah" });
const AISHA = profile({ username: "aisha-bello", full_name: "Aisha Bello" });

function basePost(overrides: Partial<PostCardData> & Pick<PostCardData, "id" | "slug" | "content_kind" | "profiles">): PostCardData {
  return {
    title: null,
    excerpt: null,
    content_kind: null,
    tags: [],
    created_at: daysAgo(2),
    published_at: daysAgo(2),
    like_count: 0,
    cover_image_url: null,
    viewer_liked: false,
    viewer_bookmarked: false,
    ...overrides,
  };
}

export interface FixtureCard {
  id: string;
  caption: string;
  post: PostCardData;
}

// ---------------------------------------------------------------------------
// POSTS
// ---------------------------------------------------------------------------

export const POST_FIXTURES: FixtureCard[] = [
  {
    id: "post-short",
    caption: "Short titleless Post",
    post: basePost({
      id: "fx-post-short",
      slug: "fx-post-short",
      content_kind: "post",
      profiles: AMARA,
      excerpt: "Office hours taught me more about how universities actually work than three years of lectures did.",
      like_count: 12,
    }),
  },
  {
    id: "post-long",
    caption: "Long Post clamped to six lines",
    post: basePost({
      id: "fx-post-long",
      slug: "fx-post-long",
      content_kind: "post",
      profiles: KWAME,
      excerpt:
        "Six months ago I moved my entire research group's data collection from paper forms to a shared tablet workflow, and I underestimated how much of the resistance had nothing to do with technology. Enumerators worried about being seen as replaceable. Supervisors worried about losing the paper trail they used to catch mistakes. Communities worried about who was really going to see their answers.\n\nWe only got past it once we let the enumerators redesign the intake screens themselves. The lesson generalizes further than fieldwork: adoption follows ownership, not training.",
      like_count: 87,
    }),
  },
  {
    id: "post-cover",
    caption: "Post with a full-width cover",
    post: basePost({
      id: "fx-post-cover",
      slug: "fx-post-cover",
      content_kind: "post",
      profiles: SENA,
      excerpt: "Three writing workshops in, the questions people ask about getting started have almost nothing to do with the rules we spend the most time explaining.",
      cover_image_url: COVER_GOLD,
      like_count: 34,
    }),
  },
  {
    id: "post-no-cover",
    caption: "Post without a cover",
    post: basePost({
      id: "fx-post-no-cover",
      slug: "fx-post-no-cover",
      content_kind: "post",
      profiles: TENDAI,
      excerpt: "Grief doesn't wait for a convenient rotation. Neither does anatomy lab.",
      like_count: 218,
    }),
  },
  {
    id: "post-missing-avatar",
    caption: "Post with a missing avatar",
    post: basePost({
      id: "fx-post-missing-avatar",
      slug: "fx-post-missing-avatar",
      content_kind: "post",
      profiles: AISHA,
      excerpt: "No profile photo yet -- the initials fallback should stay legible at every size this card renders at.",
      like_count: 6,
    }),
  },
  {
    id: "post-guest-engagement",
    caption: "Engagement row -- guest state (nothing engaged yet)",
    post: basePost({
      id: "fx-post-guest",
      slug: "fx-post-guest",
      content_kind: "post",
      profiles: WANJIRU,
      excerpt: "Guests see the same Like/Comment/Share/Save row -- clicking Like or Save should route to sign-in instead of silently failing.",
      like_count: 41,
      viewer_liked: false,
      viewer_bookmarked: false,
    }),
  },
  {
    id: "post-authenticated-engagement",
    caption: "Engagement row -- already liked and saved",
    post: basePost({
      id: "fx-post-authenticated",
      slug: "fx-post-authenticated",
      content_kind: "post",
      profiles: WANJIRU,
      excerpt: "Same post, shown as an authenticated reader who already liked and saved it -- the filled icons must not rely on color alone.",
      like_count: 42,
      viewer_liked: true,
      viewer_bookmarked: true,
    }),
  },
];

// ---------------------------------------------------------------------------
// ARTICLES
// ---------------------------------------------------------------------------

export const ARTICLE_FIXTURES: FixtureCard[] = [
  {
    id: "article-general",
    caption: "Article with a cover",
    post: basePost({
      id: "fx-article-general",
      slug: "fx-article-general",
      content_kind: "article",
      profiles: FATIMA,
      title: "What a Decade of Fee-Free Primary Schooling Actually Changed",
      excerpt: "Enrollment numbers tell one story. Classroom ratios and teacher retention tell a very different one.",
      like_count: 56,
    }),
  },
  {
    id: "article-essay",
    caption: "Article, no cover",
    post: basePost({
      id: "fx-article-essay",
      slug: "fx-article-essay",
      content_kind: "article",
      profiles: TENDAI,
      title: "The Hidden Cost of Studying Abroad",
      excerpt: "Brain drain isn't just statistics. It's the slow erosion of belonging that no scholarship line item accounts for.",
      cover_image_url: COVER_EMERALD,
      like_count: 218,
    }),
  },
  {
    id: "article-policy-brief",
    caption: "Long Article, for the reading-time line",
    post: basePost({
      id: "fx-article-policy-brief",
      slug: "fx-article-policy-brief",
      content_kind: "article",
      profiles: FATIMA,
      title: "Reforming Fuel Subsidies Without Triggering Unrest",
      excerpt: "A phased-withdrawal model drawing on Nigeria's 2012 experience, adapted for smaller import-dependent economies.",
      like_count: 61,
    }),
  },
  {
    id: "article-with-cover",
    caption: "Article with cover",
    post: basePost({
      id: "fx-article-cover",
      slug: "fx-article-cover",
      content_kind: "article",
      profiles: KWAME,
      title: "Mobile Money Didn't Save Rural Savings Groups -- Trust Did",
      excerpt: "Adoption curves flattened the moment agents started skipping the villages furthest from the tarred road.",
      cover_image_url: COVER_GOLD,
      like_count: 73,
    }),
  },
  {
    id: "article-without-cover",
    caption: "Article without cover (stays text-led)",
    post: basePost({
      id: "fx-article-no-cover",
      slug: "fx-article-no-cover",
      content_kind: "article",
      profiles: YOHANNES,
      title: "Why Addis Ababa's BRT Line Is Still a Policy Template",
      excerpt: "Ten years on, the fare model is the part every other transit authority in the region actually copied.",
      like_count: 19,
    }),
  },
  {
    id: "article-long-title",
    caption: "Very long title",
    post: basePost({
      id: "fx-article-long-title",
      slug: "fx-article-long-title",
      content_kind: "article",
      profiles: NALEDI,
      title:
        "On the Slow, Uneven, and Frequently Reversed Process of Decolonising an Undergraduate Economics Curriculum That Nobody Asked to Have Written in the First Place",
      excerpt: "Clamp sensibly -- long scholarly titles still need to communicate what the piece is actually about.",
      like_count: 28,
    }),
  },
  {
    id: "article-liked-saved",
    caption: "Liked and saved Article",
    post: basePost({
      id: "fx-article-liked-saved",
      slug: "fx-article-liked-saved",
      content_kind: "article",
      profiles: KWAME,
      title: "The Agents Who Refused to Skip the Unpaved Roads",
      excerpt: "A short follow-up on why two savings groups kept full attendance while their neighbours' didn't.",
      like_count: 74,
      viewer_liked: true,
      viewer_bookmarked: true,
    }),
  },
];
