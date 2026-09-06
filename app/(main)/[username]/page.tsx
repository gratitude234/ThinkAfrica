import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import EvidenceLegend from "@/components/profile/EvidenceLegend";
import FeaturedWork from "@/components/profile/FeaturedWork";
import FeaturedWorkManager from "@/components/profile/FeaturedWorkManager";
import ProfileBackground, { hasBackgroundContent } from "@/components/profile/ProfileBackground";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileRecordCard, { PROFILE_RECORD_LIST } from "@/components/profile/ProfileRecordCard";
import ProfileSectionNav from "@/components/profile/ProfileSectionNav";
import ProfileStickyBar from "@/components/profile/ProfileStickyBar";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import {
  getProfileIdentityLines,
  getProfileMetaDescription,
} from "@/lib/profileIdentity";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { PROFILE_COLUMNS, PROFILE_SHELL } from "@/lib/profileLayout";
import { buildProfileRecordHref } from "@/lib/profileRecord";
import {
  loadProfileIdentity,
  loadProfileView,
  type ProfileIdentityRecord,
  type ProfilePublication,
} from "@/lib/profileViewData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
}

function displayName(profile: Pick<ProfileIdentityRecord, "full_name" | "username">) {
  return profile.full_name?.trim() || profile.username;
}

/**
 * Featured work still speaks the database's column names.
 *
 * Phase 3 redesigns that component against the resolved model and this goes
 * with it. Every value is carried through from the row rather than
 * reconstructed, so nothing is invented on the way across.
 */
function toFeaturedWorkPost(publication: ProfilePublication) {
  return {
    id: publication.id,
    title: publication.title,
    slug: publication.slug,
    excerpt: publication.excerpt,
    type: publication.legacyType,
    content_kind: publication.contentKind,
    article_format: publication.articleFormat,
    citation_id: publication.citationId,
    created_at: publication.createdAt,
    published_at: publication.publishedAt,
    cover_image_url: publication.coverImageUrl,
    isCoAuthor: publication.isCoAuthor,
    feature_note: publication.featureNote ?? null,
    post_reference_counts: { reference_count: publication.referenceCount },
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  // Throws on a query failure, exactly as the page does. Answering "Profile
  // not found" because the database was unreachable would put that claim in
  // the page title and in every link preview of it.
  const profile = await loadProfileIdentity(supabase, username);
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

  const data = await loadProfileView({
    supabase,
    username,
    view: "overview",
    includeResearch: FEATURE_FLAGS.research,
  });

  /**
   * Null means the database answered and had nothing to show: no such
   * username, or a row RLS declined to reveal. A failed query never reaches
   * here, because `loadProfileView` throws and the segment's error boundary
   * takes it.
   *
   * The two used to be one branch. The profile query destructured its error
   * away, read the resulting null as "no such person", and called
   * `notFound()`. During a Supabase outage that told every visitor that every
   * member's profile did not exist, which is both wrong and unrecoverable: a
   * 404 offers nothing to retry.
   */
  if (!data?.overview) notFound();

  const { profile, viewer, opportunity, overview } = data;
  const {
    summary: recordSummary,
    latestRecord,
    featured,
    demonstratedTopics,
    interests,
  } = overview;

  const isOwnProfile = viewer.isOwnProfile;
  const hasPublishedWork = recordSummary.publicationCount > 0;
  const showBackground =
    isOwnProfile ||
    hasBackgroundContent({ profile, demonstratedTopics, interests });
  const viewerState = getProfileViewerState({
    viewerId: viewer.viewerId,
    profileId: profile.id,
  });
  const featuredIds = featured.map((post) => post.id);

  return (
    /* `first:` is load-bearing. The header below is full-bleed and should meet
       the nav, which means cancelling the shell's top padding, but a guest
       banner renders in flow directly above this on a profile and an
       unconditional pull-up slid the cover underneath it. The banner is a
       preceding sibling of this element and disappears from the DOM when it is
       dismissed, so :first-child answers "is the header really the top of the
       page" live, in both directions, without threading the flag down. */
    <div className={`${PROFILE_SHELL} first:-mt-6 lg:first:mt-0`}>
      <ProfileHeader
        profile={profile}
        demonstratedTopics={demonstratedTopics}
        recordSummary={recordSummary}
        followerCount={viewer.followerCount}
        followingCount={viewer.followingCount}
        isOwnProfile={isOwnProfile}
        currentUserId={viewer.viewerId}
        initialFollowing={viewer.isFollowing}
        initialSubscribed={viewer.isSubscribed}
        initialBlocked={viewer.isBlocked}
        isOpenToOpportunities={opportunity.isOpenToOpportunities}
        canContact={opportunity.canContact}
        talentProfileId={opportunity.talentProfileId}
        messagingEligibility={viewer.messaging}
      />

      {/* Renders its own sentinel, so it has to sit directly after the header. */}
      {!isOwnProfile && !viewer.isBlocked ? (
        <ProfileStickyBar
          authorId={profile.id}
          authorName={displayName(profile)}
          avatarUrl={profile.avatar_url}
          currentUserId={viewer.viewerId}
          initialFollowing={viewer.isFollowing}
          viewerState={viewerState}
        />
      ) : null}

      <ProfileSectionNav
        showFeatured={featured.length > 0}
        showBackground={showBackground}
      />

      {/* Work on the left, standing context in a rail. Background is short,
          factual and consulted while reading, so on a wide screen it belongs
          beside the record rather than below all of it. */}
      <div className={`mt-6 ${PROFILE_COLUMNS}`}>
        <div className="min-w-0 space-y-8">
          <FeaturedWork
            posts={featured.map(toFeaturedWorkPost)}
            isOwnProfile={isOwnProfile}
            hasPublishedWork={hasPublishedWork}
            tracking={{
              profileId: profile.id,
              viewerState,
              surface: "featured_work",
            }}
            /* One legend per page. Featured comes first, so it explains the
               evidence chips whenever it renders and the record's own trigger
               stands down. A profile with no Featured selection falls through
               to the record's, below. */
            showLegend
            action={isOwnProfile ? <FeaturedWorkManager initialPostIds={featuredIds} /> : null}
          />

          <section id="latest-record" aria-labelledby="latest-record-title" className="scroll-mt-24 lg:scroll-mt-32 space-y-4">
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
                {featured.length === 0 ? <EvidenceLegend /> : null}
                {/* Offered only when there is something behind it. It used to
                    print beside an empty record, promising a fuller version of
                    nothing. */}
                {latestRecord.length > 0 ? (
                  <Link
                    href={buildProfileRecordHref({ username: profile.username })}
                    className="tap-target focus-ring text-sm font-semibold text-emerald-ink hover:underline"
                  >
                    View full record →
                  </Link>
                ) : null}
              </div>
            </div>

            {latestRecord.length > 0 ? (
              <div className={PROFILE_RECORD_LIST}>
                {latestRecord.map((item) => (
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
        </div>

        {/* Pinned like every other aside in the app (home, explore, admin, the
            other pinned surfaces), which this one alone was not. Background is
            short and the work beside it is long, so pinning keeps the standing
            context available while a reader moves down the record instead of
            letting it scroll away in the first screen.

            No `research` prop. Research is not an active publishing format, so
            the public profile no longer loads researcher_profiles; the
            component still accepts one for the surfaces that do. */}
        <aside
          id="background"
          className="scroll-mt-24 lg:scroll-mt-32 mt-8 lg:sticky lg:top-[var(--app-sticky-offset)] lg:mt-0 lg:self-start"
        >
          <ProfileBackground
            profile={profile}
            demonstratedTopics={demonstratedTopics}
            interests={interests}
            isOwnProfile={isOwnProfile}
          />
        </aside>
      </div>
    </div>
  );
}
