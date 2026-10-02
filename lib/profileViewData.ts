import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getFeedExcludedUserIds } from "@/lib/blocking";
import { getDatabase } from "@/lib/db";
import type {
  ProfilePublicationActivityPoint,
  ProfilePublicationRow,
  ProfileRelatedThinker,
  ProfileWritingTopic,
} from "@/lib/db/profilePage";
import { profilePageRepository } from "@/lib/db/readAdapter";
import type { ProfileIdentityRecord } from "@/lib/db/types";
import {
  DEFAULT_PROFILE_TAB,
  PROFILE_TAB_KIND,
  profilePublicationKind,
  type ProfilePublicationKind,
  type ProfileTab,
} from "@/lib/profileTabs";
import { getCurrentUser } from "@/lib/serverAuth";
import { sanitizePostExcerpt } from "@/lib/utils";

/**
 * The server-side data layer for a writer's profile.
 *
 * A profile is a header and one of its tabs (see lib/profileTabs.ts): Overview, Posts,
 * Articles and About for everyone, and Drafts for the owner. The header needs
 * the identity row, the two relationship counts and, for a signed-in
 * stranger, their relationship to the profile. Posts and Articles each add one
 * page of that kind, and Drafts adds the owner's drafts. Overview reads one bounded mixed work stream plus exact Post/Article totals. About adds
 * nothing: everything it shows is on the identity row.
 *
 * Two rules the callers depend on.
 *
 * A missing profile and a failed query are different answers and are
 * reported differently. `loadProfileView` returns null only when the database
 * answered successfully and had nothing to show: no such username, or a row
 * the profiles policy declined to reveal. Every query failure throws, and the
 * route's error boundary takes it. Collapsing the two is what once made a
 * database outage report that every member's profile did not exist.
 *
 * Core profile facts are not degradable. The counts are stated as facts in the
 * header and the publication lists are what the page is, so failures there
 * throw rather than printing zero followers or an empty tab. Related Thinkers
 * is the one deliberate exception: it is supplemental discovery context, so a
 * recommendation failure is logged and omitted instead of taking the profile
 * down.
 */

export type { ProfileIdentityRecord } from "@/lib/db/types";

export const PROFILE_PUBLICATION_PAGE_SIZE = 20;
export const PROFILE_RECORD_PAGE_SIZE = 24;

export interface ProfileViewerContext {
  viewerId: string | null;
  isOwnProfile: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  followerCount: number;
  followingCount: number;
}

/** One published work, shaped for a list row. */
export interface ProfilePublication {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  kind: ProfilePublicationKind;
  coverImageUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  isCoAuthor: boolean;
  wordCount?: number | null;
}

export interface ProfilePublicationPage {
  kind: ProfilePublicationKind;
  items: ProfilePublication[];
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

/** One of the owner's drafts, shaped for the Drafts tab. */
export interface ProfileDraft {
  id: string;
  title: string | null;
  kind: ProfilePublicationKind;
  updatedAt: string;
  excerpt?: string | null;
}

export interface ProfileViewData {
  profile: ProfileIdentityRecord;
  viewer: ProfileViewerContext;
  tab: ProfileTab;
  /** Present for Posts and Articles only. Overview has its own mixed work stream. */
  publications: ProfilePublicationPage | null;
  /** Present only on the owner's Drafts tab. */
  drafts: ProfileDraft[] | null;
  overview: ProfileOverviewData | null;
}

export interface ProfileOverviewData {
  selectedWork: ProfilePublication | null;
  recentWork: ProfilePublication[];
  articleCount: number;
  postCount: number;
  totalPublished: number;
  activity: ProfilePublicationActivityPoint[];
  writingTopics: ProfileWritingTopic[];
  relatedThinkers: ProfileRelatedThinker[];
}

export interface ProfileRecordPage {
  items: ProfilePublication[];
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  articleCount: number;
  postCount: number;
  totalPublished: number;
  writingTopics: ProfileWritingTopic[];
}

export interface ProfileRecordViewData {
  profile: ProfileIdentityRecord;
  viewerId: string | null;
  isOwnProfile: boolean;
  record: ProfileRecordPage;
}


/**
 * Wraps a failed query in something a server log can hold. A gateway in front
 * of Postgres can answer with a whole HTML error page, and an unbounded
 * message puts kilobytes of it into the log on every request of an outage.
 */
function queryFailure(label: string, message: string) {
  const trimmed = message.replace(/\s+/g, " ").trim();
  const capped =
    trimmed.length > 300 ? `${trimmed.slice(0, 300)}... (truncated)` : trimmed;
  return new Error(`${label}: ${capped}`);
}

function toPublication(
  row: ProfilePublicationRow,
  kind: ProfilePublicationKind,
  isCoAuthor: boolean
): ProfilePublication {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt ? sanitizePostExcerpt(row.excerpt) : null,
    kind,
    coverImageUrl: row.cover_image_url,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    isCoAuthor,
    wordCount: row.word_count ?? null,
  };
}

/**
 * The identity lookup, memoised for the render. `generateMetadata` and the
 * page both ask for it, and before this they each paid for a round trip.
 * Keyed on the username alone: the request client each caller holds is a new
 * object every time, so keying on it would never hit.
 */
const findVisibleIdentity = cache(async (username: string) => {
  // A profile nobody may see is not found. The viewer travels with the
  // username so the direct-SQL adapter can apply the profiles policy that
  // PostgREST applies from the session.
  const viewer = await getCurrentUser();
  return getDatabase().profiles.findIdentityByUsername(
    username,
    viewer?.id ?? null
  );
});

/**
 * The public identity of one member, by username. Reads only; profile writes
 * go through lib/profileMutations.ts. The client parameter is kept and
 * ignored so call sites did not all have to change while the adapter decides
 * where the read goes.
 */
export async function loadProfileIdentity(
  _supabase: SupabaseClient,
  username: string
): Promise<ProfileIdentityRecord | null> {
  return findVisibleIdentity(username);
}

/**
 * Who is looking, and what they are to this profile. Every query is keyed on
 * ids known once the identity row resolves, so they all belong in one wave,
 * and a reader who is signed out or is the owner asks for no relationship.
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
  const repository = profilePageRepository(supabase);

  const [counts, relationship] = await Promise.all([
    repository.relationshipCounts(profileId),
    isStranger
      ? repository.viewerRelationship(profileId, viewerId as string)
      : Promise.resolve({ isFollowing: false, isBlocked: false }),
  ]);

  return {
    viewerId,
    isOwnProfile,
    isFollowing: relationship.isFollowing,
    isBlocked: relationship.isBlocked,
    followerCount: counts.followerCount,
    followingCount: counts.followingCount,
  };
}

/**
 * One page of a writer's Posts or Articles.
 *
 * A writer profile shows publications primarily authored by that writer.
 * Co-authoring is retired and no longer affects profile publication lists.
 */
export async function loadProfilePublications({
  supabase,
  profileId,
  kind,
  page = 1,
  pageSize = PROFILE_PUBLICATION_PAGE_SIZE,
}: {
  supabase: SupabaseClient;
  profileId: string;
  kind: ProfilePublicationKind;
  page?: number;
  pageSize?: number;
}): Promise<ProfilePublicationPage> {
  // One row past the page answers "is there a next page" without a count.
  const start = (page - 1) * pageSize;
  const limit = pageSize + 1;

  let branches;
  try {
    branches = await profilePageRepository(supabase).publicationBranches({
      profileId,
      // A tab is a content kind. The legacy `type` values each tab also used
      // to select went with the normalization in 20260915000005.
      contentKinds: [kind],
      start,
      limit,
    });
  } catch (error) {
    throw queryFailure(
      "publications failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  const byId = new Map<string, ProfilePublication>();
  for (const row of branches.owned) {
    byId.set(row.id, toPublication(row, kind, false));
  }

  const ordered = [...byId.values()].sort((left, right) => {
    const leftAt = left.publishedAt ?? left.createdAt;
    const rightAt = right.publishedAt ?? right.createdAt;
    return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
  });

  return {
    kind,
    items: ordered.slice(0, pageSize),
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: ordered.length > pageSize,
  };
}

/** Mixed newest-first public work for the work-first Overview. */
export async function loadProfileRecentWork({
  supabase,
  profileId,
  limit = 6,
}: {
  supabase: SupabaseClient;
  profileId: string;
  limit?: number;
}): Promise<ProfilePublication[]> {
  let branches;
  try {
    branches = await profilePageRepository(supabase).publicationBranches({
      profileId,
      contentKinds: ["post", "article"],
      start: 0,
      limit,
    });
  } catch (error) {
    throw queryFailure(
      "recent work failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  return branches.owned
    .map((row) => {
      const kind = profilePublicationKind(row);
      return kind ? toPublication(row, kind, false) : null;
    })
    .filter((item): item is ProfilePublication => Boolean(item))
    .sort((left, right) => {
      const leftAt = left.publishedAt ?? left.createdAt;
      const rightAt = right.publishedAt ?? right.createdAt;
      return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
    })
    .slice(0, limit);
}

function profileActivityStartMonth(now = new Date(), months = 12) {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1)
  );
  return start.toISOString();
}

export async function loadProfileOverview({
  supabase,
  profileId,
  viewerId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  viewerId: string | null;
}): Promise<ProfileOverviewData> {
  const repository = profilePageRepository(supabase);
  const [recentWork, counts, selectedRow, activity, writingTopics] = await Promise.all([
    loadProfileRecentWork({ supabase, profileId, limit: 7 }),
    repository.publicationCounts(profileId),
    repository.selectedWork(profileId),
    repository.publicationActivity({
      profileId,
      startMonth: profileActivityStartMonth(),
      months: 12,
    }),
    repository.publicationTopics({ profileId, limit: 6 }),
  ]);
  const selectedKind = selectedRow ? profilePublicationKind(selectedRow) : null;

  const selectedWork = selectedRow && selectedKind
    ? toPublication(selectedRow, selectedKind, false)
    : null;

  let relatedThinkers: ProfileRelatedThinker[] = [];
  if (writingTopics.length > 0) {
    try {
      const [candidates, ownerExcludedIds, viewerExcludedIds] = await Promise.all([
        repository.relatedThinkers({
          profileId,
          topicKeys: writingTopics.map((topic) => topic.key),
          viewerId,
          // Fetch a small reserve so block exclusions do not leave an otherwise
          // healthy profile with an artificially short recommendation list.
          limit: 6,
        }),
        getFeedExcludedUserIds(profileId, { strict: true }),
        viewerId && viewerId !== profileId
          ? getFeedExcludedUserIds(viewerId, { strict: true })
          : Promise.resolve([]),
      ]);

      const excludedIds = new Set<string>([
        profileId,
        ...(viewerId ? [viewerId] : []),
        ...ownerExcludedIds,
        ...viewerExcludedIds,
      ]);
      relatedThinkers = candidates
        .filter((candidate) => !excludedIds.has(candidate.id))
        .slice(0, 3);
    } catch (error) {
      // Related Thinkers is a discovery aid, not a stated profile fact. A
      // recommendation or block-exclusion failure must not turn a healthy
      // public profile into an error page. Failing closed here is also a
      // privacy requirement: uncertain block state means no recommendations.
      console.warn("[profile] related thinkers unavailable", error);
      relatedThinkers = [];
    }
  }

  return {
    selectedWork,
    recentWork: recentWork.filter((item) => item.id !== selectedWork?.id).slice(0, 6),
    articleCount: counts.articleCount,
    postCount: counts.postCount,
    totalPublished: counts.articleCount + counts.postCount,
    activity,
    writingTopics,
    relatedThinkers,
  };
}

/**
 * One chronological page of the complete public record. Unlike the Posts and
 * Articles tabs, this mixes both current product kinds into one history.
 */
export async function loadProfileRecord({
  supabase,
  profileId,
  page = 1,
  pageSize = PROFILE_RECORD_PAGE_SIZE,
}: {
  supabase: SupabaseClient;
  profileId: string;
  page?: number;
  pageSize?: number;
}): Promise<ProfileRecordPage> {
  const safePage = Math.max(1, Math.trunc(page));
  const safePageSize = Math.max(1, Math.min(50, Math.trunc(pageSize)));
  const start = (safePage - 1) * safePageSize;
  const repository = profilePageRepository(supabase);

  let branches;
  let counts;
  let writingTopics;
  try {
    [branches, counts, writingTopics] = await Promise.all([
      repository.publicationBranches({
        profileId,
        contentKinds: ["post", "article"],
        start,
        limit: safePageSize + 1,
      }),
      repository.publicationCounts(profileId),
      repository.publicationTopics({ profileId, limit: 8 }),
    ]);
  } catch (error) {
    throw queryFailure(
      "profile record failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  const items = branches.owned
    .map((row) => {
      const kind = profilePublicationKind(row);
      return kind ? toPublication(row, kind, false) : null;
    })
    .filter((item): item is ProfilePublication => Boolean(item))
    .sort((left, right) => {
      const leftAt = left.publishedAt ?? left.createdAt;
      const rightAt = right.publishedAt ?? right.createdAt;
      return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
    });

  return {
    items: items.slice(0, safePageSize),
    page: safePage,
    pageSize: safePageSize,
    hasPreviousPage: safePage > 1,
    hasNextPage: items.length > safePageSize,
    articleCount: counts.articleCount,
    postCount: counts.postCount,
    totalPublished: counts.articleCount + counts.postCount,
    writingTopics,
  };
}

export async function loadProfileRecordView({
  supabase,
  username,
  page = 1,
}: {
  supabase: SupabaseClient;
  username: string;
  page?: number;
}): Promise<ProfileRecordViewData | null> {
  const [profile, viewer] = await Promise.all([
    loadProfileIdentity(supabase, username),
    getCurrentUser(),
  ]);
  if (!profile) return null;

  const record = await loadProfileRecord({
    supabase,
    profileId: profile.id,
    page,
  });

  return {
    profile,
    viewerId: viewer?.id ?? null,
    isOwnProfile: viewer?.id === profile.id,
    record,
  };
}

/**
 * The owner's Drafts tab. Owner-only on two levels: the route asks only when
 * the signed-in viewer is the profile, and the repository answers empty for
 * anyone else without querying. A stranger forcing `?view=drafts` never
 * reaches a drafts query at all.
 */
export async function loadProfileDrafts({
  supabase,
  profileId,
  viewerId,
}: {
  supabase: SupabaseClient;
  profileId: string;
  viewerId: string;
}): Promise<ProfileDraft[]> {
  if (profileId !== viewerId) return [];

  let rows;
  try {
    rows = await profilePageRepository(supabase).ownerDrafts({ profileId, viewerId });
  } catch (error) {
    throw queryFailure(
      "drafts failed",
      error instanceof Error ? error.message : String(error)
    );
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    kind: profilePublicationKind(row) ?? "post",
    updatedAt: row.updated_at,
    excerpt: row.excerpt ? sanitizePostExcerpt(row.excerpt) : null,
  }));
}

/**
 * The one entry point the route needs. Wave 1 is the identity row and the
 * session; wave 2 is the viewer context and, on a list tab, one page of it,
 * or on the owner's Drafts tab, their drafts. Overview additionally reads the
 * one Selected Work pointer when present. Drafts requested by anyone but
 * the owner fall back to the default tab before anything is loaded.
 */
export async function loadProfileView({
  supabase,
  username,
  tab = DEFAULT_PROFILE_TAB,
  page = 1,
}: {
  supabase: SupabaseClient;
  username: string;
  tab?: ProfileTab;
  page?: number;
}): Promise<ProfileViewData | null> {
  const [profile, viewer] = await Promise.all([
    loadProfileIdentity(supabase, username),
    getCurrentUser(),
  ]);

  if (!profile) return null;

  const isOwnProfile = viewer?.id === profile.id;
  const effectiveTab = tab === "drafts" && !isOwnProfile ? DEFAULT_PROFILE_TAB : tab;

  const [viewerContext, publications, drafts, overview] = await Promise.all([
    loadProfileViewerContext({
      supabase,
      profileId: profile.id,
      viewerId: viewer?.id ?? null,
    }),
    effectiveTab === "overview" || effectiveTab === "about" || effectiveTab === "drafts"
      ? Promise.resolve(null)
      : loadProfilePublications({
          supabase,
          profileId: profile.id,
          kind: PROFILE_TAB_KIND[effectiveTab],
          page,
        }),
    effectiveTab === "drafts" && viewer
      ? loadProfileDrafts({
          supabase,
          profileId: profile.id,
          viewerId: viewer.id,
        })
      : Promise.resolve(null),
    effectiveTab === "overview"
      ? loadProfileOverview({
          supabase,
          profileId: profile.id,
          viewerId: viewer?.id ?? null,
        })
      : Promise.resolve(null),
  ]);

  return {
    profile,
    viewer: viewerContext,
    tab: effectiveTab,
    publications,
    drafts,
    overview,
  };
}
