import "server-only";
import { getDatabase } from "@/lib/db";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  legacyTypesForContentKind,
  resolveArticleFormat,
  resolveContentKind,
  type ArticleFormat,
  type ContentKind,
} from "@/lib/contentModel";
import {
  isAuthorSubscriptionsEnabled,
  isFeaturedWorkNotesEnabled,
} from "@/lib/featureFlags";
import { getMessageEligibility } from "@/lib/messaging";
import type { ProfileRecordSummary } from "@/lib/profileRecord";
import {
  loadProfileRecordPage,
  loadProfileRecordSummary,
  loadProfileTopicIndex,
  type ProfileRecordItem,
} from "@/lib/profileRecordData";
import type { DemonstratedTopic } from "@/lib/profileTopics";
import { sanitizePostExcerpt } from "@/lib/utils";

/**
 * The server-side data layer for the redesigned profile.
 *
 * Phase 3 splits the profile into Overview, Articles, Posts and About. The
 * point of this module is that those four views share one query plan instead
 * of each growing its own: the identity row and the viewer's relationship to
 * it are loaded the same way for all of them, and only the body of the view
 * differs. Without that, the Articles tab would eventually be loading featured
 * work it does not render and the About tab would be paging publications it
 * never shows.
 *
 * Two rules the callers depend on.
 *
 * A missing profile and a failed query are different answers and are
 * reported differently. `loadProfileView` returns null only when the database
 * answered successfully and had nothing to show: no such username, or a row
 * RLS declined to reveal. Every query failure throws. The route turns null
 * into `notFound()` and lets the throw reach its error boundary. Collapsing
 * the two is what made a database outage report that every member's profile
 * did not exist.
 *
 * Loaders are classified as identity-critical or degradable, and the
 * classification is stated at each one. Identity-critical means the page is
 * wrong without it, so its failure throws. Nothing here is currently
 * degradable: the sections that would qualify (Featured, the record preview)
 * are all part of what a profile is. The distinction is written down anyway,
 * because the temptation in Phase 3 will be to add a section that swallows
 * its own errors, and that decision should be deliberate rather than
 * inherited from a `?? []`.
 */

export const PROFILE_VIEWS = ["overview", "articles", "posts", "about"] as const;

export type ProfileView = (typeof PROFILE_VIEWS)[number];

export const PROFILE_PUBLICATION_PAGE_SIZE = 20;

/**
 * How much of the record the Overview previews before handing off. Six rows
 * cost about what three cover-led cards used to and show twice the work.
 */
export const PROFILE_OVERVIEW_RECORD_SIZE = 6;

/**
 * Re-exported so the many call sites that import the profile row shape from
 * this module keep working. lib/db/types owns the definition now, because the
 * adapters both have to produce it.
 */
import type { ProfileIdentityRecord } from "@/lib/db/types";

export type { ProfileIdentityRecord } from "@/lib/db/types";

export interface ProfileViewerContext {
  viewerId: string | null;
  isOwnProfile: boolean;
  isFollowing: boolean;
  isSubscribed: boolean;
  isBlocked: boolean;
  followerCount: number;
  followingCount: number;
  messaging: { eligible: boolean; reason: string | null } | null;
}

export interface ProfileOpportunityState {
  talentProfileId: string | null;
  isOpenToOpportunities: boolean;
  canContact: boolean;
}

/**
 * One published work, shaped for a list rather than for a detail page.
 *
 * `contentKind` and `articleFormat` are resolved through `contentModel`, not
 * read off the row: `posts` carries a legacy `type` alongside the newer
 * `content_kind`, and every place that decides which of the two wins has to
 * be the same place.
 */
export interface ProfilePublication {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  contentKind: ContentKind | null;
  articleFormat: ArticleFormat | null;
  /**
   * The raw `posts.type`, carried only for components that still read it.
   * FeaturedWork is the last one on this path and Phase 3 redesigns it, at
   * which point this field goes. Nothing new should branch on it: the
   * resolved `contentKind` above is the model.
   */
  legacyType: string;
  citationId: string | null;
  coverImageUrl: string | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
  isCoAuthor: boolean;
  isResponse: boolean;
  referenceCount: number;
  featureNote?: string | null;
}

export interface ProfilePublicationPage {
  items: ProfilePublication[];
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface ProfileOverviewData {
  summary: ProfileRecordSummary;
  latestRecord: ProfileRecordItem[];
  featured: ProfilePublication[];
  demonstratedTopics: DemonstratedTopic[];
  interests: string[];
}

export interface ProfileViewData {
  profile: ProfileIdentityRecord;
  viewer: ProfileViewerContext;
  opportunity: ProfileOpportunityState;
  view: ProfileView;
  /** Present for `overview`. */
  overview: ProfileOverviewData | null;
  /** Present for `articles` and `posts`. */
  publications: ProfilePublicationPage | null;
}

/**
 * Wraps a failed query in something a server log can hold.
 *
 * Postgres messages are a sentence. A gateway between here and Postgres
 * answers with a whole HTML error page, and an unbounded `error.message`
 * puts several kilobytes of Cloudflare markup into the log for every request
 * during an outage, which is when the log is least readable and most needed.
 * None of this reaches the reader either way: the route's error boundary
 * shows its own copy and a digest.
 */
function queryFailure(label: string, message: string) {
  const trimmed = message.replace(/\s+/g, " ").trim();
  const capped =
    trimmed.length > 300 ? `${trimmed.slice(0, 300)}... (truncated)` : trimmed;
  return new Error(`${label}: ${capped}`);
}


const PUBLICATION_SELECT =
  "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, citation_id, created_at, published_at, cover_image_url, post_reference_counts(reference_count)";

interface PublicationRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  tags: string[] | null;
  citation_id: string | null;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  status?: string;
  post_reference_counts?:
    | { reference_count: number | null }
    | Array<{ reference_count: number | null }>
    | null;
}

/** The aggregate arrives as a row or a one-element array, depending on join shape. */
function referenceCountOf(row: PublicationRow) {
  const aggregate = Array.isArray(row.post_reference_counts)
    ? row.post_reference_counts[0]
    : row.post_reference_counts;
  return aggregate?.reference_count ?? 0;
}

function toPublication(row: PublicationRow, isCoAuthor: boolean): ProfilePublication {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ? sanitizePostExcerpt(row.excerpt) : null,
    contentKind: resolveContentKind(row),
    articleFormat: resolveArticleFormat(row),
    legacyType: row.type,
    citationId: row.citation_id,
    coverImageUrl: row.cover_image_url,
    tags: row.tags ?? [],
    publishedAt: row.published_at,
    createdAt: row.created_at,
    isCoAuthor,
    isResponse: row.in_response_to !== null,
    referenceCount: referenceCountOf(row),
  };
}

/**
 * A PostgREST predicate selecting posts whose *resolved* content kind is the
 * one asked for.
 *
 * Built from `legacyTypesForContentKind` rather than written out, so the
 * legacy mapping exists once. A row is the kind asked for when it says so on
 * `content_kind`, or when `content_kind` is null and the legacy `type` maps
 * to it. Rows that carry an explicit different `content_kind` are excluded
 * even if their legacy type disagrees, which is the same precedence
 * `resolveContentKind` applies.
 */
export function contentKindFilter(kind: ContentKind) {
  const legacy = legacyTypesForContentKind(kind);
  const legacyClause =
    legacy.length > 0
      ? `,and(content_kind.is.null,type.in.(${legacy.join(",")}))`
      : "";
  return `content_kind.eq.${kind}${legacyClause}`;
}

/**
 * Identity-critical.
 *
 * Returns null only for an answer, never for a failure: no such username, or
 * a row the viewer is not permitted to see. A query error throws with the
 * database's message, which the route logs and the error boundary replaces
 * with something a reader can act on.
 */
/**
 * The public identity of one member, by username.
 *
 * The query moved behind lib/db so the profiles domain can be pointed at Neon
 * without this module changing. The client parameter is kept and ignored:
 * every caller already has one to hand, and removing it would ripple a
 * signature change through call sites for no benefit while the adapter still
 * defaults to Supabase. It is named with a leading underscore rather than
 * deleted, so the next reader can see the omission is deliberate.
 *
 * Reads only. Profile *writes* stay on the Supabase path entirely; see
 * lib/profileMutations.ts and docs/adr-neon-authorization.md.
 */
export async function loadProfileIdentity(
  _supabase: SupabaseClient,
  username: string
): Promise<ProfileIdentityRecord | null> {
  return getDatabase().profiles.findIdentityByUsername(username);
}

/**
 * Identity-critical. Who is looking, and what they are to this profile.
 *
 * Every query here is keyed on ids known after the identity row resolves, so
 * they all belong in one wave. Message eligibility included: it used to be
 * awaited on its own after the rest had settled, which cost the page a whole
 * serial round trip to answer a question none of the other queries needed.
 */
export async function loadProfileViewerContext({
  supabase,
  profileId,
  viewerId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  viewerId: string | null;
}): Promise<ProfileViewerContext> {
  const isOwnProfile = viewerId === profileId;
  const isStranger = Boolean(viewerId) && !isOwnProfile;

  const [
    followerResult,
    followingResult,
    followResult,
    subscriptionResult,
    blockResult,
    messaging,
  ] = await Promise.all([
    supabase
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("following_id", profileId),
    // Counted rather than stored, like the follower count above it. Both are
    // head queries over the same index, and a denormalised counter would need
    // a trigger and a reconciliation job to earn its keep.
    supabase
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("follower_id", profileId),
    isStranger
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", viewerId as string)
          .eq("following_id", profileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isAuthorSubscriptionsEnabled() && isStranger
      ? supabase
          .from("author_subscriptions")
          .select("subscriber_id")
          .eq("subscriber_id", viewerId as string)
          .eq("author_id", profileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isStranger
      ? supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", viewerId as string)
          .eq("blocked_id", profileId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isStranger
      ? getMessageEligibility(supabase, viewerId as string, profileId)
      : Promise.resolve(null),
  ]);

  // The relationship counts are identity-critical: the header states them as
  // facts. A failure here throws rather than printing zero followers for
  // someone with thousands.
  if (followerResult.error) {
    throw queryFailure("follower count failed", followerResult.error.message);
  }
  if (followingResult.error) {
    throw queryFailure("following count failed", followingResult.error.message);
  }

  return {
    viewerId,
    isOwnProfile,
    isFollowing: Boolean(followResult.data),
    isSubscribed: Boolean(subscriptionResult.data),
    isBlocked: Boolean(blockResult.data),
    followerCount: followerResult.count ?? 0,
    followingCount: followingResult.count ?? 0,
    messaging,
  };
}

/**
 * Identity-critical, and cheap: one row.
 *
 * Visibility follows the rule the talent surfaces already use. `public` is
 * open, `partners_only` needs a signed-in viewer, and the owner always sees
 * their own state.
 */
export async function loadProfileOpportunityState({
  supabase,
  profileId,
  viewerId,
  isOwnProfile,
}: {
  supabase: SupabaseClient;
  profileId: string;
  viewerId: string | null;
  isOwnProfile: boolean;
}): Promise<ProfileOpportunityState> {
  const { data, error } = await supabase
    .from("talent_profiles")
    .select("id, open_to_opportunities, visibility")
    .eq("user_id", profileId)
    .maybeSingle<{ id: string; open_to_opportunities: boolean; visibility: string }>();

  if (error) throw queryFailure("opportunity state failed", error.message);

  const visible = Boolean(
    data?.open_to_opportunities &&
      (isOwnProfile ||
        data.visibility === "public" ||
        (data.visibility === "partners_only" && viewerId))
  );

  return {
    talentProfileId: data?.id ?? null,
    isOpenToOpportunities: visible,
    canContact: visible && !isOwnProfile,
  };
}

/**
 * Identity-critical. The author's own selection, with the work behind it.
 *
 * One round trip rather than two. The selection ids used to come back first
 * and the posts were fetched in a wave after them, purely because the query
 * was written as two statements; `profile_featured_posts.post_id` has a
 * foreign key to `posts`, so PostgREST can embed the work directly.
 */
export async function loadProfileFeaturedWork({
  supabase,
  profileId,
}: {
  supabase: SupabaseClient;
  profileId: string;
}): Promise<ProfilePublication[]> {
  const noteColumn = isFeaturedWorkNotesEnabled() ? ", feature_note" : "";
  const { data, error } = await supabase
    .from("profile_featured_posts")
    .select(
      `post_id, position${noteColumn}, posts!profile_featured_posts_post_id_fkey(${PUBLICATION_SELECT}, status)`
    )
    .eq("user_id", profileId)
    .order("position", { ascending: true });

  if (error) throw queryFailure("featured work failed", error.message);

  type FeaturedRow = {
    post_id: string;
    position: number;
    feature_note?: string | null;
    posts: PublicationRow | PublicationRow[] | null;
  };

  return ((data ?? []) as unknown as FeaturedRow[]).flatMap((row) => {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    // A selection can outlive its work: a post that was unpublished stays
    // referenced here and simply stops rendering.
    if (!post || post.status !== "published") return [];
    return [
      {
        ...toPublication(post, post.author_id !== profileId),
        featureNote: row.feature_note ?? null,
      },
    ];
  });
}

/**
 * Identity-critical. One page of an author's Articles or Posts.
 *
 * Queries `posts` rather than `profile_record_entries` on purpose. The list
 * needs titles, excerpts and covers, which the record index deliberately does
 * not carry, so reading the index first would only add a round trip before
 * the same table. Co-authored work is unioned in from `post_authors` and
 * deduplicated, which is what keeps a co-author's own profile showing work
 * they did not originate.
 */
export async function loadProfilePublications({
  supabase,
  profileId,
  contentKind,
  page = 1,
  pageSize = PROFILE_PUBLICATION_PAGE_SIZE,
  includeResponses = true,
}: {
  supabase: SupabaseClient;
  profileId: string;
  contentKind: ContentKind;
  page?: number;
  pageSize?: number;
  /** Articles are never responses in practice; Posts often are. */
  includeResponses?: boolean;
}): Promise<ProfilePublicationPage> {
  const filter = contentKindFilter(contentKind);
  // One row past the page, so "is there a next page" is answered without a
  // second counting query. The profile lists are browsed, not indexed, and an
  // exact total costs a full scan to print a number nobody reads.
  const start = (page - 1) * pageSize;
  const limit = pageSize + 1;

  const [ownedResult, coauthoredResult] = await Promise.all([
    supabase
      .from("posts")
      .select(PUBLICATION_SELECT)
      .eq("author_id", profileId)
      .eq("status", "published")
      .or(filter)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(start, start + limit - 1),
    supabase
      .from("post_authors")
      .select(`posts!post_authors_post_id_fkey(${PUBLICATION_SELECT}, status)`)
      .eq("user_id", profileId)
      .not("accepted_at", "is", null)
      .order("accepted_at", { ascending: false })
      .limit(start + limit),
  ]);

  if (ownedResult.error) {
    throw queryFailure("publications failed", ownedResult.error.message);
  }
  if (coauthoredResult.error) {
    throw queryFailure("co-authored publications failed", coauthoredResult.error.message);
  }

  const byId = new Map<string, ProfilePublication>();
  for (const row of (ownedResult.data ?? []) as unknown as PublicationRow[]) {
    byId.set(row.id, toPublication(row, false));
  }
  for (const wrapper of (coauthoredResult.data ?? []) as unknown as Array<{
    posts: PublicationRow | PublicationRow[] | null;
  }>) {
    const row = Array.isArray(wrapper.posts) ? wrapper.posts[0] : wrapper.posts;
    if (!row || row.status !== "published" || row.author_id === profileId) continue;
    // The co-author branch cannot be filtered by PostgREST across the
    // embed, so the same resolver decides here. One definition either way.
    if (resolveContentKind(row) !== contentKind) continue;
    if (!byId.has(row.id)) byId.set(row.id, toPublication(row, true));
  }

  const ordered = [...byId.values()]
    .filter((item) => includeResponses || !item.isResponse)
    .sort((left, right) => {
      const leftAt = left.publishedAt ?? left.createdAt;
      const rightAt = right.publishedAt ?? right.createdAt;
      return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
    });

  const items = ordered.slice(0, pageSize);
  return {
    items,
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: ordered.length > pageSize,
  };
}

/**
 * Everything the Overview shows below the identity block.
 *
 * Grouped into one function so the caller states its intent once and this
 * decides the shape of the wave. All four are identity-critical.
 */
export async function loadProfileOverview({
  supabase,
  profile,
  includeResearch,
}: {
  supabase: SupabaseClient;
  profile: ProfileIdentityRecord;
  includeResearch: boolean;
}): Promise<ProfileOverviewData> {
  const [summary, latestRecord, featured, topics] = await Promise.all([
    loadProfileRecordSummary(supabase, profile.id, includeResearch),
    loadProfileRecordPage({
      supabase,
      profileId: profile.id,
      filter: "all",
      quality: "all",
      page: 1,
      pageSize: PROFILE_OVERVIEW_RECORD_SIZE,
      includeResearch,
    }),
    loadProfileFeaturedWork({ supabase, profileId: profile.id }),
    loadProfileTopicIndex({
      supabase,
      profileId: profile.id,
      declaredInterests: profile.interests,
      includeResearch,
    }),
  ]);

  return {
    summary,
    latestRecord: latestRecord.items,
    featured,
    demonstratedTopics: topics.demonstratedTopics,
    interests: topics.interests,
  };
}

/**
 * The one entry point a route needs.
 *
 * Two waves, and the split is structural rather than stylistic. Wave 1 is
 * the identity row and the session, which is everything that can be asked
 * before `profile.id` is known. Wave 2 is everything that needs it, and the
 * body of the requested view is one member of that wave rather than a third
 * round of awaits after it.
 *
 * `view` decides what wave 2 carries. About asks for no publication list at
 * all, and Articles asks for no featured work: the cost of a view is what
 * that view shows.
 */
export async function loadProfileView({
  supabase,
  username,
  view = "overview",
  page = 1,
  includeResearch = false,
}: {
  supabase: SupabaseClient;
  username: string;
  view?: ProfileView;
  page?: number;
  includeResearch?: boolean;
}): Promise<ProfileViewData | null> {
  const [profile, sessionResult] = await Promise.all([
    loadProfileIdentity(supabase, username),
    supabase.auth.getUser(),
  ]);

  // Null is the answer "there is no such profile, or you may not see it".
  // A failure would already have thrown out of loadProfileIdentity.
  if (!profile) return null;

  const viewerId = sessionResult.data.user?.id ?? null;
  const isOwnProfile = viewerId === profile.id;

  const [viewer, opportunity, overview, publications] = await Promise.all([
    loadProfileViewerContext({ supabase, profileId: profile.id, viewerId }),
    loadProfileOpportunityState({
      supabase,
      profileId: profile.id,
      viewerId,
      isOwnProfile,
    }),
    view === "overview"
      ? loadProfileOverview({ supabase, profile, includeResearch })
      : Promise.resolve(null),
    view === "articles" || view === "posts"
      ? loadProfilePublications({
          supabase,
          profileId: profile.id,
          contentKind: view === "articles" ? "article" : "post",
          page,
        })
      : Promise.resolve(null),
  ]);

  return { profile, viewer, opportunity, view, overview, publications };
}
