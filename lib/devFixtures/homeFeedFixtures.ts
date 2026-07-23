/**
 * Deterministic, development-only fixture data for the Home feed visual
 * preview harness (app/dev-preview/feed). Never imported by production
 * routes/components -- see that page for the notFound() gate.
 *
 * Every record here is a plain object conforming to the real card data
 * contracts (PostCardData / HomeFeaturedPost / FeaturedTodayPost /
 * DebateInterludeData / ActivationState). No `as any`, no partial shapes --
 * if a card's props change shape, this file should fail to typecheck
 * rather than silently drift out of sync with the real contract.
 */

import type { PostCardData } from "@/components/post/PostCard";
import type { HomeFeaturedPost } from "@/components/post/HomeFeaturedLead";
import type { FeaturedTodayPost } from "@/components/ui/HomeSidebar";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import type { ActivationState } from "@/lib/activation";

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

// Realistic, named African student/scholar profiles -- reused across
// sections so the same "person" can plausibly appear as both an author and
// a co-author/parent in different fixtures.
const AMARA = profile({ username: "amara-nwosu", full_name: "Amara Nwosu", university: "University of Lagos" });
const KWAME = profile({ username: "kwame-boateng", full_name: "Kwame Boateng", university: "University of Ghana" });
const FATIMA = profile({ username: "fatima-diallo", full_name: "Fatima Diallo", university: "Cheikh Anta Diop University" });
const TENDAI = profile({ username: "tendai-moyo", full_name: "Tendai Moyo", university: "University of Zimbabwe" });
const WANJIRU = profile({ username: "wanjiru-kamau", full_name: "Wanjiru Kamau", university: "University of Nairobi" });
const NALEDI = profile({
  username: "naledi-dlamini",
  full_name: "Naledi Dlamini",
  university:
    "Faculty of Commerce, Law and Management, University of the Witwatersrand, Johannesburg",
});
const YOHANNES = profile({ username: "yohannes-tesfaye", full_name: "Yohannes Tesfaye", university: "Addis Ababa University" });
const SENA = profile({ username: "sena-mensah", full_name: "Sena Mensah", university: "KNUST" });
const AISHA = profile({ username: "aisha-bello", full_name: "Aisha Bello", university: null });
const CHIDI = profile({ username: "chidi-okafor", full_name: "Chidi Okafor", university: "University of Nigeria, Nsukka" });

function basePost(overrides: Partial<PostCardData> & Pick<PostCardData, "id" | "slug" | "type" | "profiles">): PostCardData {
  return {
    title: null,
    excerpt: null,
    content_kind: null,
    article_format: null,
    tags: [],
    created_at: daysAgo(2),
    published_at: daysAgo(2),
    like_count: 0,
    response_count: 0,
    citation_id: null,
    published_version_id: null,
    document_original_name: null,
    document_mime_type: null,
    document_size_bytes: null,
    cover_image_url: null,
    surface_reason: null,
    in_response_to: null,
    response_to: null,
    co_authors: [],
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
      type: "blog",
      content_kind: "post",
      profiles: AMARA,
      excerpt: "Office hours taught me more about how universities actually work than three years of lectures did.",
      like_count: 12,
      response_count: 3,
    }),
  },
  {
    id: "post-long",
    caption: "Long Post clamped to five lines",
    post: basePost({
      id: "fx-post-long",
      slug: "fx-post-long",
      type: "blog",
      content_kind: "post",
      profiles: KWAME,
      excerpt:
        "Six months ago I moved my entire research group's data collection from paper forms to a shared tablet workflow, and I underestimated how much of the resistance had nothing to do with technology. Enumerators worried about being seen as replaceable. Supervisors worried about losing the paper trail they used to catch mistakes. Communities worried about who was really going to see their answers.\n\nWe only got past it once we let the enumerators redesign the intake screens themselves. The lesson generalizes further than fieldwork: adoption follows ownership, not training.",
      like_count: 87,
      response_count: 14,
    }),
  },
  {
    id: "post-cover",
    caption: "Post with a full-width cover",
    post: basePost({
      id: "fx-post-cover",
      slug: "fx-post-cover",
      type: "blog",
      content_kind: "post",
      profiles: SENA,
      excerpt: "Three campus info sessions in, the questions students ask about fellowships have almost nothing to do with the deadlines we spend the most time explaining.",
      cover_image_url: COVER_GOLD,
      like_count: 34,
      response_count: 5,
    }),
  },
  {
    id: "post-no-cover",
    caption: "Post without a cover",
    post: basePost({
      id: "fx-post-no-cover",
      slug: "fx-post-no-cover",
      type: "blog",
      content_kind: "post",
      profiles: TENDAI,
      excerpt: "Grief doesn't wait for a convenient rotation. Neither does anatomy lab.",
      like_count: 218,
      response_count: 22,
    }),
  },
  {
    id: "post-missing-avatar",
    caption: "Post with a missing avatar",
    post: basePost({
      id: "fx-post-missing-avatar",
      slug: "fx-post-missing-avatar",
      type: "blog",
      content_kind: "post",
      profiles: AISHA,
      excerpt: "No profile photo yet -- the initials fallback should stay legible at every size this card renders at.",
      like_count: 6,
      response_count: 0,
    }),
  },
  {
    id: "post-long-institution",
    caption: "Post with a long institution name",
    post: basePost({
      id: "fx-post-long-institution",
      slug: "fx-post-long-institution",
      type: "blog",
      content_kind: "post",
      profiles: NALEDI,
      excerpt: "The author line needs to truncate this institution name gracefully instead of wrapping the whole card wider.",
      like_count: 9,
      response_count: 1,
    }),
  },
  {
    id: "post-response-titleless-parent",
    caption: "Post responding to a titleless parent",
    post: basePost({
      id: "fx-post-response",
      slug: "fx-post-response",
      type: "blog",
      content_kind: "post",
      profiles: CHIDI,
      excerpt: "Completely agree, and the same pattern shows up in how first-year advisors get assigned -- ownership beats mandate every time.",
      in_response_to: "fx-post-short",
      response_to: {
        slug: "fx-post-short",
        title: null,
        content_kind: "post",
        type: "blog",
        profiles: { username: AMARA.username, full_name: AMARA.full_name },
      },
      like_count: 4,
      response_count: 0,
    }),
  },
  {
    id: "post-guest-engagement",
    caption: "Engagement row -- guest state (nothing engaged yet)",
    post: basePost({
      id: "fx-post-guest",
      slug: "fx-post-guest",
      type: "blog",
      content_kind: "post",
      profiles: WANJIRU,
      excerpt: "Guests see the same Like/Respond/Save row -- clicking Like or Save should route to sign-in instead of silently failing.",
      like_count: 41,
      response_count: 6,
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
      type: "blog",
      content_kind: "post",
      profiles: WANJIRU,
      excerpt: "Same post, shown as an authenticated reader who already liked and saved it -- the filled icons must not rely on color alone.",
      like_count: 42,
      response_count: 6,
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
    caption: "General Article (no genre -- must not read as Essay)",
    post: basePost({
      id: "fx-article-general",
      slug: "fx-article-general",
      type: "blog",
      content_kind: "article",
      article_format: null,
      profiles: FATIMA,
      title: "What a Decade of Fee-Free Primary Schooling Actually Changed",
      excerpt: "Enrollment numbers tell one story. Classroom ratios and teacher retention tell a very different one.",
      like_count: 56,
      response_count: 9,
    }),
  },
  {
    id: "article-essay",
    caption: "Essay",
    post: basePost({
      id: "fx-article-essay",
      slug: "fx-article-essay",
      type: "essay",
      content_kind: "article",
      article_format: "essay",
      profiles: TENDAI,
      title: "The Hidden Cost of Studying Abroad",
      excerpt: "Brain drain isn't just statistics. It's the slow erosion of belonging that no scholarship line item accounts for.",
      cover_image_url: COVER_EMERALD,
      like_count: 218,
      response_count: 31,
    }),
  },
  {
    id: "article-policy-brief",
    caption: "Policy Brief-formatted Article",
    post: basePost({
      id: "fx-article-policy-brief",
      slug: "fx-article-policy-brief",
      type: "policy_brief",
      content_kind: "article",
      article_format: "policy_brief",
      profiles: FATIMA,
      title: "Reforming Fuel Subsidies Without Triggering Unrest",
      excerpt: "A phased-withdrawal model drawing on Nigeria's 2012 experience, adapted for smaller import-dependent economies.",
      like_count: 61,
      response_count: 8,
    }),
  },
  {
    id: "article-with-cover",
    caption: "Article with cover",
    post: basePost({
      id: "fx-article-cover",
      slug: "fx-article-cover",
      type: "blog",
      content_kind: "article",
      profiles: KWAME,
      title: "Mobile Money Didn't Save Rural Savings Groups -- Trust Did",
      excerpt: "Adoption curves flattened the moment agents started skipping the villages furthest from the tarred road.",
      cover_image_url: COVER_GOLD,
      like_count: 73,
      response_count: 11,
    }),
  },
  {
    id: "article-without-cover",
    caption: "Article without cover (stays text-led)",
    post: basePost({
      id: "fx-article-no-cover",
      slug: "fx-article-no-cover",
      type: "blog",
      content_kind: "article",
      profiles: YOHANNES,
      title: "Why Addis Ababa's BRT Line Is Still a Policy Template",
      excerpt: "Ten years on, the fare model is the part every other transit authority in the region actually copied.",
      like_count: 19,
      response_count: 2,
    }),
  },
  {
    id: "article-long-title",
    caption: "Very long title",
    post: basePost({
      id: "fx-article-long-title",
      slug: "fx-article-long-title",
      type: "essay",
      content_kind: "article",
      article_format: "essay",
      profiles: NALEDI,
      title:
        "On the Slow, Uneven, and Frequently Reversed Process of Decolonising an Undergraduate Economics Curriculum That Nobody Asked to Have Written in the First Place",
      excerpt: "Clamp sensibly -- long scholarly titles still need to communicate what the piece is actually about.",
      like_count: 28,
      response_count: 4,
    }),
  },
  {
    id: "article-coauthored",
    caption: "Co-authored Article",
    post: basePost({
      id: "fx-article-coauthored",
      slug: "fx-article-coauthored",
      type: "blog",
      content_kind: "article",
      profiles: SENA,
      title: "Notes From Three Campus Ambassador Cohorts",
      excerpt: "What worked in Kumasi didn't work in Accra, and neither approach worked at all in a commuter campus.",
      co_authors: [{ user_id: "fx-coauthor-1", profile: { username: AISHA.username, full_name: AISHA.full_name } }],
      like_count: 15,
      response_count: 2,
    }),
  },
  {
    id: "article-response",
    caption: "Article response",
    post: basePost({
      id: "fx-article-response",
      slug: "fx-article-response",
      type: "blog",
      content_kind: "article",
      profiles: CHIDI,
      title: "A Counterpoint on Subsidy Sequencing",
      excerpt: "The 2012 timeline works for fuel. It breaks down the moment you try to apply it to electricity tariffs.",
      in_response_to: "fx-article-policy-brief",
      response_to: {
        slug: "fx-article-policy-brief",
        title: "Reforming Fuel Subsidies Without Triggering Unrest",
        content_kind: "article",
        type: "policy_brief",
        profiles: { username: FATIMA.username, full_name: FATIMA.full_name },
      },
      like_count: 7,
      response_count: 1,
    }),
  },
  {
    id: "article-liked-saved",
    caption: "Liked and saved Article",
    post: basePost({
      id: "fx-article-liked-saved",
      slug: "fx-article-liked-saved",
      type: "blog",
      content_kind: "article",
      profiles: KWAME,
      title: "The Agents Who Refused to Skip the Unpaved Roads",
      excerpt: "A short follow-up on why two savings groups kept full attendance while their neighbours' didn't.",
      like_count: 74,
      response_count: 11,
      viewer_liked: true,
      viewer_bookmarked: true,
    }),
  },
];

// ---------------------------------------------------------------------------
// RESEARCH
// ---------------------------------------------------------------------------

export const RESEARCH_FIXTURES: FixtureCard[] = [
  {
    id: "research-unreviewed",
    caption: "Unreviewed Research (no evidence badge)",
    post: basePost({
      id: "fx-research-unreviewed",
      slug: "fx-research-unreviewed",
      type: "research",
      content_kind: "research",
      profiles: WANJIRU,
      title: "Early-Stage Working Paper: Groundwater Access in Peri-Urban Nairobi",
      excerpt: "A first-pass household survey across four informal settlements, ahead of the full review cycle.",
      document_original_name: "groundwater-access-working-paper-v1.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 1_180_000,
      like_count: 3,
    }),
  },
  {
    id: "research-reviewed",
    caption: "Reviewed Research",
    post: basePost({
      id: "fx-research-reviewed",
      slug: "fx-research-reviewed",
      type: "research",
      content_kind: "research",
      profiles: FATIMA,
      title: "Community Health Worker Retention After the 2023 Stipend Reform",
      excerpt: "A two-year panel of 340 community health workers across three regions, tracking attrition before and after the reform.",
      published_version_id: "fx-version-1",
      document_original_name: "chw-retention-2023-reform.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 3_640_000,
      like_count: 48,
    }),
  },
  {
    id: "research-citable",
    caption: "Citable Research (Citable wins over Reviewed)",
    post: basePost({
      id: "fx-research-citable",
      slug: "fx-research-citable",
      type: "research",
      content_kind: "research",
      profiles: KWAME,
      title: "Mobile Money Adoption Among Rural Savings Cooperatives in East Africa",
      excerpt: "A field study across 40 savings groups in western Kenya, examining why agent proximity outweighs fee structure.",
      citation_id: "IND-2026-0041",
      published_version_id: "fx-version-2",
      document_original_name: "mobile-money-rural-cooperatives.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 2_516_582,
      like_count: 94,
    }),
  },
  {
    id: "research-coauthors",
    caption: "Research with co-authors",
    post: basePost({
      id: "fx-research-coauthors",
      slug: "fx-research-coauthors",
      type: "research",
      content_kind: "research",
      profiles: TENDAI,
      title: "Drought-Resilient Maize Varieties: A Three-Season Field Comparison",
      excerpt: "Yield data from twelve smallholder plots across two agro-ecological zones in Mashonaland.",
      co_authors: [
        { user_id: "fx-coauthor-2", profile: { username: CHIDI.username, full_name: CHIDI.full_name } },
        { user_id: "fx-coauthor-3", profile: { username: YOHANNES.username, full_name: YOHANNES.full_name } },
      ],
      citation_id: "IND-2026-0052",
      document_original_name: "drought-resilient-maize-varieties.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 4_210_000,
      like_count: 21,
    }),
  },
  {
    id: "research-long-title-institution",
    caption: "Research with long title and institution",
    post: basePost({
      id: "fx-research-long",
      slug: "fx-research-long",
      type: "research",
      content_kind: "research",
      profiles: NALEDI,
      title:
        "Intergenerational Transmission of Land Tenure Insecurity in Post-Apartheid Communal Areas: Evidence From a Twenty-Year Household Panel",
      excerpt: "Long scholarly titles should wrap naturally instead of clamping into an unreadable fragment.",
      published_version_id: "fx-version-3",
      document_original_name: "land-tenure-intergenerational-transmission.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 5_872_000,
      like_count: 33,
    }),
  },
  {
    id: "research-no-page-count",
    caption: "Research with a known document size, no page count",
    post: basePost({
      id: "fx-research-no-pages",
      slug: "fx-research-no-pages",
      type: "research",
      content_kind: "research",
      profiles: AISHA,
      title: "Language of Instruction and Numeracy Outcomes in Northern Nigeria",
      excerpt: "Page counts aren't in the current data contract -- this card must omit them gracefully rather than fabricate one.",
      citation_id: "IND-2026-0063",
      document_original_name: "language-of-instruction-numeracy.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 812_000,
      like_count: 14,
    }),
  },
  {
    id: "research-no-document",
    caption: "Research with no accessible document (manuscript action omitted)",
    post: basePost({
      id: "fx-research-no-document",
      slug: "fx-research-no-document",
      type: "research",
      content_kind: "research",
      profiles: SENA,
      title: "A Record With Missing Document Metadata",
      excerpt: "No document_original_name/mime type is set -- the manuscript row and View paper action should both disappear, not link to nothing.",
      like_count: 2,
    }),
  },
  {
    id: "research-response-context",
    caption: "Research with a response-context line",
    post: basePost({
      id: "fx-research-response-context",
      slug: "fx-research-response-context",
      type: "research",
      content_kind: "research",
      profiles: FATIMA,
      title: "A Replication With a Larger Sample",
      excerpt: "Re-running the original design across two additional regions to check whether the retention effect holds.",
      in_response_to: "fx-research-reviewed",
      response_to: {
        slug: "fx-research-reviewed",
        title: "Community Health Worker Retention After the 2023 Stipend Reform",
        content_kind: "research",
        type: "research",
        profiles: { username: FATIMA.username, full_name: FATIMA.full_name },
      },
      published_version_id: "fx-version-4",
      document_original_name: "chw-retention-replication.pdf",
      document_mime_type: "application/pdf",
      document_size_bytes: 2_040_000,
      like_count: 9,
    }),
  },
];

// ---------------------------------------------------------------------------
// SURFACE REASON (For You / Discover)
// ---------------------------------------------------------------------------

export const SURFACE_REASON_FIXTURE: FixtureCard = {
  id: "post-surface-reason",
  caption: "For You card with a surface_reason explanation line",
  post: basePost({
    id: "fx-post-surface-reason",
    slug: "fx-post-surface-reason",
    type: "blog",
    content_kind: "post",
    profiles: WANJIRU,
    excerpt: "This should show one quiet gray explanatory line above the author, not a badge, and not repeated elsewhere on the card.",
    surface_reason: "Matches your reading interests",
    like_count: 5,
  }),
};

// ---------------------------------------------------------------------------
// FEATURED + RAIL
// ---------------------------------------------------------------------------

export const FEATURED_FIXTURE: HomeFeaturedPost = {
  id: "fx-featured-lead",
  title: "What My First Year of Medical School Taught Me About Grief",
  slug: "fx-featured-lead",
  excerpt: "I didn't expect the cadavers to be the easy part. A reflection on losing my grandmother during my first anatomy rotation.",
  type: "essay",
  content_kind: "article",
  article_format: "essay",
  cover_image_url: null,
  profiles: { username: TENDAI.username, full_name: TENDAI.full_name, university: TENDAI.university, avatar_url: null },
};

export const FEATURED_TODAY_FIXTURE: FeaturedTodayPost = {
  id: "fx-featured-today",
  title: "Reforming Fuel Subsidies Without Triggering Unrest",
  slug: "fx-article-policy-brief",
  type: "policy_brief",
  content_kind: "article",
  article_format: "policy_brief",
  profiles: { username: FATIMA.username, full_name: FATIMA.full_name },
};

export const RECENT_DRAFT_FIXTURE = {
  id: "fx-draft-1",
  title: "Untitled reflection on the 2026 admissions cycle",
  updated_at: daysAgo(0, 3),
  type: "blog",
  content_kind: "post",
};

export const ACTIVATION_FALLBACK_FIXTURE: ActivationState = {
  profileComplete: false,
  followCount: 1,
  meaningfulEngagementCount: 0,
  firstContributionStarted: false,
  firstContributionLabel: null,
  responseStartedCount: 0,
  submittedPostCount: 0,
  draftCount: 0,
  debateArgumentCount: 0,
  activated: false,
  tasks: [
    { key: "profile", label: "Add your university", description: "Readers verify credibility from your profile basics.", href: "/settings", done: false },
    { key: "follow", label: "Follow 3 writers", description: "Your Following feed needs at least a few writers to be useful.", href: "/onboarding?step=follow", done: true },
    { key: "read", label: "Read your first post", description: "See how the review and response system works before you publish.", href: "/", done: false },
    { key: "start", label: "Start a response", description: "Reply to a post you agree or disagree with.", href: "/", done: false },
    { key: "submit", label: "Submit your first Post", description: "Posts publish immediately -- no review required.", href: "/write", done: false },
  ],
  nextTask: {
    key: "profile",
    label: "Add your university",
    description: "Readers verify credibility from your profile basics.",
    href: "/settings",
    done: false,
  },
};

export const DEBATE_FIXTURE: DebateInterludeData = {
  id: "fx-debate-1",
  title: "Should African universities adopt English-only instruction policies?",
  status: "active",
  endsAt: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  argumentCount: 142,
  motionForCount: 61,
  motionAgainstCount: 81,
};

export interface FixtureWriter {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

export const WRITER_FIXTURES: FixtureWriter[] = [
  { id: "fx-writer-1", username: FATIMA.username, full_name: FATIMA.full_name, university: FATIMA.university, avatar_url: null },
  { id: "fx-writer-2", username: KWAME.username, full_name: KWAME.full_name, university: KWAME.university, avatar_url: null },
  { id: "fx-writer-3", username: YOHANNES.username, full_name: YOHANNES.full_name, university: "Institute of Development Research, Addis Ababa University", avatar_url: null },
  // A fourth candidate exists in the pool so the "cap at three" rule has
  // something to actually cap.
  { id: "fx-writer-4", username: AISHA.username, full_name: AISHA.full_name, university: null, avatar_url: null },
];

export const TOPIC_FIXTURES: string[] = [
  "Climate Policy",
  "Health Systems",
  "Technology",
  "Public Health",
  "Legal Theory",
  "African Philosophy",
  "Urban Planning",
];

// ---------------------------------------------------------------------------
// DISCOVERY INTERLUDES (rendered directly -- see the preview page for why)
// ---------------------------------------------------------------------------

export const TOPIC_INTERLUDE_POSTS: PostCardData[] = ARTICLE_FIXTURES.slice(0, 2).map((fixture) => ({
  ...fixture.post,
  tags: ["Public Health"],
}));
