import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDatabase } from "@/lib/db";
import type { ProfilePublicationRow } from "@/lib/db/profilePage";
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
 * A profile is a header and one of three tabs (see lib/profileTabs.ts). The
 * header needs the identity row, the two relationship counts and, for a
 * signed-in stranger, their relationship to the profile. Posts and Articles
 * each add one page of that kind. About adds nothing: everything it shows is
 * on the identity row.
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
 * Nothing here is degradable. The counts are stated as facts in the header
 * and the list is what the page is, so a failure in either throws rather than
 * printing zero followers or an empty tab.
 */

export type { ProfileIdentityRecord } from "@/lib/db/types";

export const PROFILE_PUBLICATION_PAGE_SIZE = 20;

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
}

export interface ProfilePublicationPage {
  kind: ProfilePublicationKind;
  items: ProfilePublication[];
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface ProfileViewData {
  profile: ProfileIdentityRecord;
  viewer: ProfileViewerContext;
  tab: ProfileTab;
  /** Present for Posts and Articles, null for About. */
  publications: ProfilePublicationPage | null;
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
 * LEGACY COMPATIBILITY: existing co-authored publications. Co-authoring is
 * retired, but a piece somebody was credited on still shows on their profile,
 * so accepted credits are unioned in and deduplicated. The two branches keep
 * their established bounds (owned is offset-paginated, co-authored is taken
 * from the top); see lib/db/profilePage.ts.
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
  for (const row of branches.coauthored) {
    if (!row || row.status !== "published" || row.author_id === profileId) continue;
    // The co-authored branch cannot be filtered across the embed, so the same
    // classifier the tabs are defined by decides here.
    if (profilePublicationKind(row) !== kind) continue;
    if (!byId.has(row.id)) byId.set(row.id, toPublication(row, kind, true));
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

/**
 * The one entry point the route needs. Wave 1 is the identity row and the
 * session; wave 2 is the viewer context and, on a list tab, one page of it.
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

  const [viewerContext, publications] = await Promise.all([
    loadProfileViewerContext({
      supabase,
      profileId: profile.id,
      viewerId: viewer?.id ?? null,
    }),
    tab === "about"
      ? Promise.resolve(null)
      : loadProfilePublications({
          supabase,
          profileId: profile.id,
          kind: PROFILE_TAB_KIND[tab],
          page,
        }),
  ]);

  return { profile, viewer: viewerContext, tab, publications };
}
