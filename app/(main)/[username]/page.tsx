import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import DemonstratedExpertise from "@/components/profile/DemonstratedExpertise";
import EvidenceLegend from "@/components/profile/EvidenceLegend";
import ProfileRecognition from "@/components/profile/ProfileRecognition";
import FeaturedWork from "@/components/profile/FeaturedWork";
import FeaturedWorkManager from "@/components/profile/FeaturedWorkManager";
import ProfileBackground, { hasBackgroundContent } from "@/components/profile/ProfileBackground";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileRecordCard, { PROFILE_RECORD_LIST } from "@/components/profile/ProfileRecordCard";
import ProfileSectionNav from "@/components/profile/ProfileSectionNav";
import ProfileStickyBar from "@/components/profile/ProfileStickyBar";
import {
  FEATURE_FLAGS,
  isAuthorSubscriptionsEnabled,
  isFeaturedWorkNotesEnabled,
  isProfilePositioningEnabled,
  RESEARCH_TYPE_QUERY_EXCLUSION,
} from "@/lib/featureFlags";
import { getMessageEligibility } from "@/lib/messaging";
import {
  getProfileIdentityLines,
  getProfileMetaDescription,
} from "@/lib/profileIdentity";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { loadProfileCredibilityGraph } from "@/lib/credibilityGraphData";
import {
  deriveDeclaredInterests,
  deriveDemonstratedTopics,
} from "@/lib/profileTopics";
import { PROFILE_COLUMNS, PROFILE_SHELL } from "@/lib/profileLayout";
import { buildProfileRecordHref } from "@/lib/profileRecord";
import { loadProfileRecordPage, loadProfileRecordSummary } from "@/lib/profileRecordData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
}

interface ProfileRecord {
  id: string;
  username: string;
  full_name: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  is_alumni: boolean;
  bio: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  verified: boolean;
  verified_type: string | null;
  interests: string[] | null;
  profile_type: string | null;
  professional_title: string | null;
  organization_name: string | null;
  organization_website: string | null;
  positioning_statement?: string | null;
}

interface TalentProfile {
  id: string;
  open_to_opportunities: boolean;
  visibility: string;
}

interface PortfolioPost {
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
  published_version_id?: string | null;
  post_reference_counts?:
    | { reference_count: number | null }
    | Array<{ reference_count: number | null }>
    | null;
  post_authors?: Array<{ user_id: string; accepted_at: string | null }>;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  isCoAuthor?: boolean;
  status?: string;
}

interface CoAuthorPortfolioRow {
  posts: PortfolioPost | PortfolioPost[] | null;
}

const PROFILE_BASE_SELECT =
  "id, username, full_name, country, university, field_of_study, graduation_year, is_alumni, bio, avatar_url, cover_image_url, verified, verified_type, interests, profile_type, professional_title, organization_name, organization_website";

/**
 * The positioning column is named only once its migration has been applied.
 * See isProfilePositioningEnabled for why an unconditional select would take
 * every profile page down until then.
 */
function profileSelect() {
  return isProfilePositioningEnabled()
    ? `${PROFILE_BASE_SELECT}, positioning_statement`
    : PROFILE_BASE_SELECT;
}

const PORTFOLIO_SELECT =
  "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, citation_id, published_version_id, created_at, published_at, cover_image_url, post_reference_counts(reference_count), post_authors(user_id, accepted_at)";

/**
 * How much of the record the profile previews before handing off to the full
 * record. This was 3 while an entry was a cover-led card costing about 590px,
 * where six would have been a wall. An entry is a row now, so six preview
 * rows cost about what three cards did and show twice the work.
 */
const PROFILE_LATEST_RECORD_SIZE = 6;

function displayName(profile: Pick<ProfileRecord, "full_name" | "username">) {
  return profile.full_name?.trim() || profile.username;
}

/** The aggregate arrives as a row or a one-element array, depending on join shape. */
function referenceCountOf(post: PortfolioPost) {
  const aggregate = Array.isArray(post.post_reference_counts)
    ? post.post_reference_counts[0]
    : post.post_reference_counts;
  return aggregate?.reference_count ?? 0;
}

function normalizeCoAuthoredPosts(rows: unknown, profileId: string) {
  return ((rows ?? []) as CoAuthorPortfolioRow[]).flatMap((row) => {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    if (!post || post.status !== "published" || post.author_id === profileId) return [];
    if (!FEATURE_FLAGS.research && post.type === "research") return [];
    return [{ ...post, isCoAuthor: true }];
  });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(profileSelect())
    .eq("username", username)
    .maybeSingle();
  const profile = data as ProfileRecord | null;
  if (!profile) return { title: "Profile not found - Indegenius" };

  const name = displayName(profile);
  const identity = getProfileIdentityLines(profile);
  const title = `${name}: ${identity.headline}`;
  // An author's own statement of what they are working on is the best
  // description of their page when they wrote one. It falls back to the bio,
  // then to the derived identity line.
  const description = getProfileMetaDescription(profile, name);

  return {
    title,
    description,
    alternates: { canonical: `/${profile.username}` },
    openGraph: {
      type: "profile",
      title,
      description,
      images: [profile.avatar_url ?? "/logo.png"],
    },
    twitter: { card: "summary", title, description, images: [profile.avatar_url ?? "/logo.png"] },
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createClient();
  const [{ data: profileData }, { data: userData }] = await Promise.all([
    supabase.from("profiles").select(profileSelect()).eq("username", username).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const profile = profileData as ProfileRecord | null;
  if (!profile) notFound();

  const user = userData.user;
  const isOwnProfile = user?.id === profile.id;

  const recordSummaryPromise = loadProfileRecordSummary(supabase, profile.id, FEATURE_FLAGS.research);
  const latestRecordPromise = loadProfileRecordPage({
    supabase,
    profileId: profile.id,
    filter: "all",
    quality: "all",
    page: 1,
    pageSize: PROFILE_LATEST_RECORD_SIZE,
    includeResearch: FEATURE_FLAGS.research,
  });

  const [
    recordSummary,
    latestRecord,
    followerResult,
    talentResult,
    featuredResult,
    followResult,
    subscriptionResult,
    blockResult,
    researcherResult,
  ] = await Promise.all([
    recordSummaryPromise,
    latestRecordPromise,
    supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("talent_profiles").select("id, open_to_opportunities, visibility").eq("user_id", profile.id).maybeSingle<TalentProfile>(),
    supabase
      .from("profile_featured_posts")
      // feature_note is named only once its migration is applied. See
      // isFeaturedWorkNotesEnabled.
      .select(
        isFeaturedWorkNotesEnabled()
          ? "post_id, position, feature_note"
          : "post_id, position"
      )
      .eq("user_id", profile.id)
      .order("position", { ascending: true }),
    user && !isOwnProfile
      ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    isAuthorSubscriptionsEnabled() && user && !isOwnProfile
      ? supabase.from("author_subscriptions").select("subscriber_id").eq("subscriber_id", user.id).eq("author_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    user && !isOwnProfile
      ? supabase.from("user_blocks").select("blocker_id").eq("blocker_id", user.id).eq("blocked_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
    FEATURE_FLAGS.research
      ? supabase.from("researcher_profiles").select("headline, research_interests, methods, orcid_url, website_url").eq("user_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const featuredRows = (featuredResult.data ?? []) as unknown as Array<{
    post_id: string;
    position: number;
    feature_note?: string | null;
  }>;
  const featuredIds = featuredRows.map((row) => row.post_id);
  const featureNoteById = new Map(
    featuredRows.map((row) => [row.post_id, row.feature_note ?? null])
  );
  const topicSelect = "id, author_id, in_response_to, tags, type";
  const [ownedTopicsResult, coauthoredTopicsResult, featuredPostsResult] = await Promise.all([
    supabase
      .from("posts")
      .select(topicSelect)
      .eq("author_id", profile.id)
      .eq("status", "published")
      .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION),
    supabase
      .from("post_authors")
      .select(`posts!post_authors_post_id_fkey(${topicSelect}, status)`)
      .eq("user_id", profile.id)
      .not("accepted_at", "is", null),
    featuredIds.length > 0
      ? supabase
          .from("posts")
          .select(PORTFOLIO_SELECT)
          .in("id", featuredIds)
          .eq("status", "published")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const ownedTopics = ((ownedTopicsResult.data ?? []) as unknown as PortfolioPost[]).map(
    (post) => ({ ...post, isCoAuthor: false })
  );
  const coauthoredTopics = normalizeCoAuthoredPosts(coauthoredTopicsResult.data, profile.id);
  const topicPosts = [
    ...ownedTopics,
    ...coauthoredTopics.filter(
      (post) => !ownedTopics.some((owned) => owned.id === post.id)
    ),
  ];
  // Two lists, kept apart from here down. Demonstrated topics come only from
  // tags on published work, so every chip built from them resolves to at
  // least one record entry. Interests are what the author declared, and they
  // never seed a record filter.
  const demonstratedTopics = deriveDemonstratedTopics(topicPosts);
  const interests = deriveDeclaredInterests(profile.interests, demonstratedTopics);
  const coauthoredIds = new Set(coauthoredTopics.map((post) => post.id));
  const featuredPool = (
    (featuredPostsResult.data ?? []) as unknown as PortfolioPost[]
  )
    .filter((post) => FEATURE_FLAGS.research || post.type !== "research")
    .map((post) => ({ ...post, isCoAuthor: coauthoredIds.has(post.id) }));
  const featuredById = new Map(featuredPool.map((post) => [post.id, post]));
  const featuredPosts = featuredIds.flatMap((postId) => {
    const post = featuredById.get(postId);
    return post
      ? [{ ...post, feature_note: featureNoteById.get(postId) ?? null }]
      : [];
  });

  const talentProfile = talentResult.data;
  const opportunityVisible = Boolean(
    talentProfile?.open_to_opportunities &&
      (isOwnProfile || talentProfile.visibility === "public" || (talentProfile.visibility === "partners_only" && user))
  );
  const messagingEligibility = user && !isOwnProfile
    ? await getMessageEligibility(supabase, user.id, profile.id)
    : null;

  const isBlocked = Boolean(blockResult.data);
  const hasPublishedWork = recordSummary.publicationCount > 0;
  const showBackground =
    isOwnProfile ||
    hasBackgroundContent({
      profile,
      demonstratedTopics,
      interests,
      research: researcherResult.data,
    });
  const viewerState = getProfileViewerState({
    viewerId: user?.id ?? null,
    profileId: profile.id,
  });

  /**
   * Credibility signals derive from work this page has already loaded, so the
   * graph costs a bounded number of extra round trips rather than one per
   * topic or per signal. It returns empty when the Phase 3 migrations are not
   * applied, which keeps the section absent rather than broken.
   */
  const credibility = await loadProfileCredibilityGraph({
    supabase,
    profileId: profile.id,
    publishedWork: topicPosts.map((post) => ({
      postId: post.id,
      slug: post.slug,
      title: post.title?.trim() || "Untitled work",
      occurredAt: post.published_at ?? post.created_at,
      tags: post.tags ?? [],
      isCoAuthor: Boolean(post.isCoAuthor),
      sourceBacked: referenceCountOf(post) > 0,
      citable: Boolean(post.citation_id),
    })),
  });

  return (
    <div className={PROFILE_SHELL}>
      <ProfileHeader
        profile={profile}
        demonstratedTopics={demonstratedTopics}
        recordSummary={recordSummary}
        followerCount={followerResult.count ?? 0}
        isOwnProfile={isOwnProfile}
        currentUserId={user?.id ?? null}
        initialFollowing={Boolean(followResult.data)}
        initialSubscribed={Boolean(subscriptionResult.data)}
        initialBlocked={isBlocked}
        isOpenToOpportunities={opportunityVisible}
        canContact={opportunityVisible && !isOwnProfile}
        talentProfileId={talentProfile?.id ?? null}
        messagingEligibility={messagingEligibility}
      />

      {/* Renders its own sentinel, so it has to sit directly after the header. */}
      {!isOwnProfile && !isBlocked ? (
        <ProfileStickyBar
          authorId={profile.id}
          authorName={displayName(profile)}
          avatarUrl={profile.avatar_url}
          currentUserId={user?.id ?? null}
          initialFollowing={Boolean(followResult.data)}
          viewerState={viewerState}
        />
      ) : null}

      <ProfileSectionNav
        showFeatured={featuredPosts.length > 0}
        showBackground={showBackground}
      />

      {/* Work on the left, standing context in a rail. Background is short,
          factual and consulted while reading, so on a wide screen it belongs
          beside the record rather than below all of it. */}
      <div className={`mt-6 ${PROFILE_COLUMNS}`}>
        <div className="min-w-0 space-y-8">
          <FeaturedWork
            posts={featuredPosts}
            isOwnProfile={isOwnProfile}
            hasPublishedWork={hasPublishedWork}
            tracking={{
              profileId: profile.id,
              viewerState,
              surface: "featured_work",
            }}
            action={isOwnProfile ? <FeaturedWorkManager initialPostIds={featuredIds} /> : null}
          />

          <section id="latest-record" aria-labelledby="latest-record-title" className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-card-border pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
                  Intellectual Record
                </p>
                <h2 id="latest-record-title" className="font-display mt-1 text-xl font-semibold text-ink">
                  Latest from their record
                </h2>
              </div>
              <div className="flex items-center gap-4">
                <EvidenceLegend />
                {/* Offered only when there is something behind it. It used to
                    print beside an empty record, promising a fuller version of
                    nothing. */}
                {latestRecord.items.length > 0 ? (
                  <Link
                    href={buildProfileRecordHref({ username: profile.username })}
                    className="tap-target focus-ring text-sm font-semibold text-emerald-ink hover:underline"
                  >
                    View full record →
                  </Link>
                ) : null}
              </div>
            </div>

            {latestRecord.items.length > 0 ? (
              <div className={PROFILE_RECORD_LIST}>
                {latestRecord.items.map((item) => (
                  <ProfileRecordCard
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    tracking={{
                      profileId: profile.id,
                      viewerState,
                      surface: "latest_record",
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-card-border bg-card p-7 text-center">
                <p className="text-sm text-ink-muted">
                  {isOwnProfile ? "Your Intellectual Record starts with your first published contribution." : `${displayName(profile)} has not published any work yet.`}
                </p>
                {isOwnProfile ? (
                  <Link href="/write" className="tap-target focus-ring mt-3 inline-block font-semibold text-emerald-ink">
                    Publish your first contribution →
                  </Link>
                ) : null}
              </div>
            )}
          </section>

          {/* Evidence about the work sits below the work, and recognition
              below that. The hierarchy is deliberate: what this person wrote
              comes before what can be counted about it. */}
          <DemonstratedExpertise
            username={profile.username}
            topics={credibility.expertise}
            isOwnProfile={isOwnProfile}
          />

          <ProfileRecognition
            signals={credibility.signals}
            profileId={profile.id}
            viewerState={viewerState}
            isOwnProfile={isOwnProfile}
          />
        </div>

        <aside id="background" className="mt-8 lg:mt-0">
          <ProfileBackground
            profile={profile}
            demonstratedTopics={demonstratedTopics}
            interests={interests}
            research={researcherResult.data}
            isOwnProfile={isOwnProfile}
          />
        </aside>
      </div>
    </div>
  );
}
