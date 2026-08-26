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
import { FEATURE_FLAGS, isAuthorSubscriptionsEnabled, RESEARCH_TYPE_QUERY_EXCLUSION } from "@/lib/featureFlags";
import { getMessageEligibility } from "@/lib/messaging";
import { getProfileIdentityLines } from "@/lib/profileIdentity";
import { deriveProfileTopics } from "@/lib/profileTopics";
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

const PROFILE_SELECT =
  "id, username, full_name, country, university, field_of_study, graduation_year, is_alumni, bio, avatar_url, cover_image_url, verified, verified_type, interests, profile_type, professional_title, organization_name, organization_website";

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
    .select(PROFILE_SELECT)
    .eq("username", username)
    .maybeSingle();
  const profile = data as ProfileRecord | null;
  if (!profile) return { title: "Profile not found - Indegenius" };

  const name = displayName(profile);
  const identity = getProfileIdentityLines(profile);
  const title = `${name}: ${identity.headline}`;
  const description = profile.bio?.trim() || `${identity.headline}${identity.affiliation ? ` at ${identity.affiliation}` : ""}. View ${name}'s Intellectual Record on Indegenius.`;

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
    supabase.from("profiles").select(PROFILE_SELECT).eq("username", username).maybeSingle(),
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
    supabase.from("profile_featured_posts").select("post_id, position").eq("user_id", profile.id).order("position", { ascending: true }),
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

  const featuredIds = (featuredResult.data ?? []).map((row) => row.post_id as string);
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
  const topics = deriveProfileTopics(topicPosts, profile.interests);
  const coauthoredIds = new Set(coauthoredTopics.map((post) => post.id));
  const featuredPool = (
    (featuredPostsResult.data ?? []) as unknown as PortfolioPost[]
  )
    .filter((post) => FEATURE_FLAGS.research || post.type !== "research")
    .map((post) => ({ ...post, isCoAuthor: coauthoredIds.has(post.id) }));
  const featuredById = new Map(featuredPool.map((post) => [post.id, post]));
  const featuredPosts = featuredIds.flatMap((postId) => {
    const post = featuredById.get(postId);
    return post ? [post] : [];
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
    hasBackgroundContent({ profile, topics, research: researcherResult.data });

  return (
    <div className={PROFILE_SHELL}>
      <ProfileHeader
        profile={profile}
        topics={topics}
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
                <Link
                  href={buildProfileRecordHref({ username: profile.username })}
                  className="tap-target focus-ring text-sm font-semibold text-emerald-ink hover:underline"
                >
                  View full record →
                </Link>
              </div>
            </div>

            {latestRecord.items.length > 0 ? (
              <div className={PROFILE_RECORD_LIST}>
                {latestRecord.items.map((item) => <ProfileRecordCard key={`${item.kind}-${item.id}`} item={item} />)}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-card-border bg-card p-7 text-center">
                <p className="text-sm text-ink-muted">
                  {isOwnProfile ? "Your Intellectual Record starts with your first published idea." : `${displayName(profile)} has not published any work yet.`}
                </p>
                {isOwnProfile ? (
                  <Link href="/write" className="tap-target focus-ring mt-3 inline-block font-semibold text-emerald-ink">
                    Publish your first idea →
                  </Link>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <aside id="background" className="mt-8 lg:mt-0">
          <ProfileBackground
            profile={profile}
            topics={topics}
            research={researcherResult.data}
            isOwnProfile={isOwnProfile}
          />
        </aside>
      </div>
    </div>
  );
}
