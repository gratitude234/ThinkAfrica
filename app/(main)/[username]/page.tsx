import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FeaturedWork from "@/components/profile/FeaturedWork";
import FeaturedWorkManager from "@/components/profile/FeaturedWorkManager";
import OpportunityBanner from "@/components/profile/OpportunityBanner";
import OpportunityProfileEditor from "@/components/opportunities/OpportunityProfileEditor";
import OpportunityReadinessCard from "@/components/opportunities/OpportunityReadinessCard";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileContentTabs from "@/components/profile/ProfileContentTabs";
import ProfileDetails from "@/components/profile/ProfileDetails";
import RecordPanel from "@/components/profile/RecordPanel";
import ResearchProfileCard, {
  type PublicResearchProfile,
  type PublicResearchProject,
} from "@/components/profile/ResearchProfileCard";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import { getMessageEligibility } from "@/lib/messaging";
import {
  getOpportunityReadinessSummary,
  type OpportunityReadinessSummary,
} from "@/lib/opportunityReadiness";
import {
  getProfileCredibilitySummary,
  type ProfileCredibilitySummary,
} from "@/lib/profileCredibility";
import { createClient } from "@/lib/supabase/server";
import { formatMonthYear } from "@/lib/utils";
import { isFormallyReviewed } from "@/lib/contentModel";
import { isAuthorSubscriptionsEnabled } from "@/lib/featureFlags";
import { getEngagementCounts } from "@/lib/dailyBrief";
import { getIntellectualRecordSummary } from "@/lib/intellectualRecord";

interface PageProps {
  params: Promise<{ username: string }>;
}

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
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
  points: number;
  cover_image_url: string | null;
  verified: boolean;
  verified_type: string | null;
  interests: string[] | null;
  profile_type: string | null;
  created_at: string;
}

interface TalentProfile {
  id: string;
  open_to_opportunities: boolean;
  opportunity_types: string[] | null;
  cv_url: string | null;
  linkedin_url: string | null;
  skills: string[] | null;
  visibility: string;
}

interface ProfilePost {
  id: string;
  author_id?: string;
  title: string | null;
  slug: string;
  in_response_to?: string | null;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  tags: string[] | null;
  citation_id?: string | null;
  published_version_id?: string | null;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  read_count: number | null;
  cover_image_url: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
    verified_type?: string | null;
  } | null;
}

interface ProfilePostRow extends Omit<ProfilePost, "profiles"> {
  profiles:
    | ProfilePost["profiles"]
    | NonNullable<ProfilePost["profiles"]>[];
}

type PortfolioPost = ProfilePost & {
  isCoAuthor?: boolean;
  co_authors?: Array<{
    user_id: string;
    profile: { username: string; full_name: string | null } | null;
  }>;
};

interface ResearchMembershipRow {
  role: string;
  project:
    | Omit<PublicResearchProject, "role">
    | Array<Omit<PublicResearchProject, "role">>
    | null;
}

interface TopArgumentRecord {
  id: string;
  content: string;
  stance: string | null;
  upvotes: number | null;
  round_number: number | null;
  created_at: string;
  debate_id: string;
  debates: {
    id: string;
    title: string;
    status?: string | null;
  } | null;
}

interface TopArgumentRow extends Omit<TopArgumentRecord, "debates"> {
  debates:
    | TopArgumentRecord["debates"]
    | NonNullable<TopArgumentRecord["debates"]>[];
}

function getDisplayName(profile: {
  full_name: string | null;
  username: string;
}) {
  return profile.full_name ?? profile.username;
}

function getFirstName(profile: {
  full_name: string | null;
  username: string;
}) {
  const name = profile.full_name?.trim();
  return name ? name.split(/\s+/)[0] : profile.username;
}

function getBioFirstLine(bio: string | null) {
  const firstLine = bio?.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine;
}

function clampText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

// Evidence-based, not name-based: a post's kind/type says its workflow
// *requires* review, but only citation_id/published_version_id prove a
// specific record actually completed it (see lib/contentModel.ts).
function isReviewedWork(post: { citation_id?: string | null; published_version_id?: string | null }) {
  return isFormallyReviewed(post);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, full_name, bio, avatar_url, username, university, field_of_study"
    )
    .eq("username", username)
    .single();

  if (!profile) {
    return { title: "Profile not found - Indegenius" };
  }

  const { count: postCount } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("status", "published")
    .eq("author_id", profile.id);

  const displayName = profile.full_name ?? profile.username;
  const bioFirstLine = getBioFirstLine(profile.bio);
  const title = clampText(
    bioFirstLine
      ? `${displayName} - ${bioFirstLine}`
      : `${displayName} - Indegenius`,
    60
  );
  const description = profile.bio
    ? clampText(profile.bio, 155)
    : clampText(
        `View ${displayName}'s Intellectual Record, including ${(postCount ?? 0).toLocaleString()} published contributions, on Indegenius.`,
        155
      );
  const image = profile.avatar_url ?? "/logo.png";

  return {
    title,
    description,
    openGraph: {
      type: "profile",
      title,
      description,
      images: [{ url: image, width: 400, height: 400 }],
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: [image],
    },
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, country, university, field_of_study, graduation_year, is_alumni, bio, avatar_url, points, cover_image_url, verified, verified_type, interests, profile_type, created_at"
    )
    .eq("username", username)
    .single<ProfileRecord>();

  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isOwnProfile = user?.id === profile.id;

  const [
    { data: posts },
    { data: coAuthoredPosts },
    { data: userBadges },
    { count: followerCount },
    { count: followingCount },
    { data: talentProfile },
    { data: topArguments },
    { data: featuredRows },
    { count: debateContributionCount },
    followStatus,
    subscriptionStatus,
    blockStatus,
    { data: researcherProfile },
    { data: researchMemberships },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, citation_id, published_version_id, created_at, published_at, view_count, read_count, cover_image_url, profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type), post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))"
      )
      .eq("author_id", profile.id)
      .eq("status", "published")
      .order("published_at", { ascending: false }),
    supabase
      .from("post_authors")
      .select(
        "post_id, posts!post_authors_post_id_fkey(id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, status, tags, citation_id, published_version_id, created_at, published_at, view_count, read_count, cover_image_url, profiles!posts_author_id_fkey(username, full_name, university, avatar_url, verified, verified_type))"
      )
      .eq("user_id", profile.id)
      .not("accepted_at", "is", null),
    supabase
      .from("user_badges")
      .select("badge_id, awarded_at, badges (id, name, description, icon)")
      .eq("user_id", profile.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", profile.id),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", profile.id),
    supabase
      .from("talent_profiles")
      .select(
        "id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility"
      )
      .eq("user_id", profile.id)
      .single<TalentProfile>(),
    supabase
      .from("debate_arguments")
      .select(
        "id, content, stance, upvotes, round_number, created_at, debate_id, debates!debate_arguments_debate_id_fkey(id, title, status)"
      )
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("profile_featured_posts")
      .select("post_id, position")
      .eq("user_id", profile.id)
      .order("position", { ascending: true }),
    supabase
      .from("debate_arguments")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id),
    user && user.id !== profile.id
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user.id)
          .eq("following_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isAuthorSubscriptionsEnabled() && user && user.id !== profile.id
      ? supabase
          .from("author_subscriptions")
          .select("subscriber_id")
          .eq("subscriber_id", user.id)
          .eq("author_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    user && user.id !== profile.id
      ? supabase
          .from("user_blocks")
          .select("blocker_id")
          .eq("blocker_id", user.id)
          .eq("blocked_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("researcher_profiles")
      .select(
        "headline, overview, research_interests, methods, collaboration_status, preferred_roles, orcid_url, website_url"
      )
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("research_project_members")
      .select(
        "role, project:research_projects!research_project_members_project_id_fkey(id, slug, title, summary, status, disciplines, updated_at)"
      )
      .eq("user_id", profile.id)
      .eq("status", "active")
      .order("joined_at", { ascending: false }),
  ]);

  const publicResearchProjects = (
    (researchMemberships ?? []) as unknown as ResearchMembershipRow[]
  )
    .map((membership) => {
      const project = Array.isArray(membership.project)
        ? membership.project[0]
        : membership.project;
      return project ? { ...project, role: membership.role } : null;
    })
    .filter((project): project is PublicResearchProject => project !== null)
    .sort(
      (left, right) =>
        new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
    );

  const normalizedPosts = ((posts ?? []) as unknown as ProfilePostRow[]).map(
    (post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
    co_authors: Array.isArray((post as { post_authors?: unknown[] }).post_authors)
      ? ((post as { post_authors?: Array<Record<string, unknown>> }).post_authors ?? [])
          .filter((row) => !!row.accepted_at)
          .filter((row) => row.user_id !== (post as { author_id?: string }).author_id)
          .map((row) => ({
            user_id: row.user_id as string,
            profile: Array.isArray(row.profile)
              ? (row.profile[0] as { username: string; full_name: string | null })
              : (row.profile as { username: string; full_name: string | null }),
          }))
      : [],
    isCoAuthor: false,
  }));

  const normalizedCoAuthoredPosts = (coAuthoredPosts ?? [])
    .map((row) => {
      const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
      if (
        !post ||
        (post as { author_id?: string }).author_id === profile.id ||
        (post as { status?: string }).status !== "published"
      ) {
        return null;
      }
      return {
        ...post,
        profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
        isCoAuthor: true,
      };
    })
    .filter((post): post is NonNullable<typeof post> => post !== null);

  const mergedPostsBase = [
    ...normalizedPosts,
    ...normalizedCoAuthoredPosts.filter(
      (post) => !normalizedPosts.some((ownedPost) => ownedPost.id === post?.id)
    ),
  ] as PortfolioPost[];

  const portfolioPostIds = mergedPostsBase.map((post) => post.id);
  const [{ data: portfolioLikeCounts }, engagementCounts] = await Promise.all([
    portfolioPostIds.length > 0
      ? supabase
          .from("post_like_counts")
          .select("like_count")
          .in("post_id", portfolioPostIds)
      : Promise.resolve({ data: [] }),
    getEngagementCounts(supabase, portfolioPostIds),
  ]);
  const mergedPosts = mergedPostsBase.map((post) => ({
    ...post,
    reference_count: engagementCounts.referenceCounts[post.id] ?? 0,
    response_count: engagementCounts.responseCounts[post.id] ?? 0,
  }));

  const badges = (userBadges ?? [])
    .map((userBadge) =>
      Array.isArray(userBadge.badges) ? userBadge.badges[0] : userBadge.badges
    )
    .filter(Boolean) as Badge[];

  const totalViews = mergedPosts.reduce(
    (sum, post) => sum + (post.read_count ?? 0),
    0
  );
  const totalLikes = (
    (portfolioLikeCounts ?? []) as Array<{ like_count: number }>
  ).reduce((sum, row) => sum + row.like_count, 0);
  const citableWorkCount = mergedPosts.filter((post) => Boolean(post.citation_id)).length;
  const reviewedWorkCount = mergedPosts.filter(isReviewedWork).length;
  const coAuthoredWorkCount = mergedPosts.filter((post) => post.isCoAuthor).length;
  const topicMap = mergedPosts
    .flatMap((post) => post.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .reduce((acc, tag) => {
      acc.set(tag, (acc.get(tag) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  const topicStats: Array<{ tag: string; count: number }> = [];
  topicMap.forEach((count: number, tag: string) => {
    topicStats.push({ tag, count });
  });
  topicStats.sort(
    (left, right) => right.count - left.count || left.tag.localeCompare(right.tag)
  );

  const postsById = new Map(mergedPosts.map((post) => [post.id, post]));
  const featuredPostIds = ((featuredRows ?? []) as Array<{
    post_id: string;
    position: number;
  }>).map((row) => row.post_id);
  const curatedFeaturedPosts = featuredPostIds
    .map((postId) => postsById.get(postId))
    .filter((post): post is (typeof mergedPosts)[number] => Boolean(post));
  const featuredPosts =
    curatedFeaturedPosts.length > 0
      ? curatedFeaturedPosts
      : [...mergedPosts]
          .sort((left, right) => (right.read_count ?? 0) - (left.read_count ?? 0))
          .slice(0, 3);

  const normalizedTopArguments = (
    (topArguments ?? []) as unknown as TopArgumentRow[]
  ).map((argument) => ({
      ...argument,
      debates: Array.isArray(argument.debates)
        ? argument.debates[0]
        : argument.debates,
    }));
  const opportunityVisible =
    !!talentProfile?.open_to_opportunities &&
    (isOwnProfile ||
      talentProfile.visibility === "public" ||
      (talentProfile.visibility === "partners_only" && !!user));

  const messagingEligibility =
    user && user.id !== profile.id
      ? await getMessageEligibility(supabase, user.id, profile.id)
      : null;

  const displayName = getDisplayName(profile);
  const firstName = getFirstName(profile);
  const opportunityReadiness = getOpportunityReadinessSummary({
    profile,
    talentProfile,
    posts: mergedPosts.map((post) => ({
      type: post.type,
      status: "published",
      citation_id: (post as { citation_id?: string | null }).citation_id ?? null,
    })),
    setupHref: `/${profile.username}#opportunity-profile`,
  });
  const showOwnOpportunityReadiness =
    isOwnProfile &&
    (mergedPosts.length > 0 ||
      Boolean(talentProfile?.open_to_opportunities) ||
      Boolean(talentProfile));
  const recordSummary = getIntellectualRecordSummary({
    posts: mergedPosts.map((post) => ({
      inResponseTo: post.in_response_to,
      citationId: post.citation_id,
      publishedVersionId: post.published_version_id,
      referenceCount: post.reference_count,
      coAuthorCount: post.co_authors?.length ?? 0,
      isCoAuthor: post.isCoAuthor,
    })),
    debateContributionCount,
  });
  const credibilitySummary = getProfileCredibilitySummary({
    profile,
    stats: {
      publishedCount: mergedPosts.length,
      citableCount: citableWorkCount,
      reviewedCount: reviewedWorkCount,
      coAuthoredCount: coAuthoredWorkCount,
      debateContributionCount: debateContributionCount ?? 0,
      sourceBackedCount: recordSummary.sourceBackedCount,
      responseCount: recordSummary.responseCount,
      followerCount: followerCount ?? 0,
      badgeCount: badges.length,
      topicCount: topicStats.length,
      featuredWorkCount: curatedFeaturedPosts.length,
      opportunityReadinessScore: opportunityReadiness.score,
      isOpenToOpportunities: Boolean(talentProfile?.open_to_opportunities),
    },
  });

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      {showOwnOpportunityReadiness ? (
        <RetentionEventTracker
          event="opportunity_readiness_viewed"
          metadata={{ source: "profile", score: opportunityReadiness.score }}
        />
      ) : null}

      {/* 1. Identity -- who this is. Carries no contribution counts. */}
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwnProfile}
        currentUserId={user?.id ?? null}
        initialFollowing={!!followStatus.data}
        initialSubscribed={!!subscriptionStatus.data}
        initialBlocked={!!blockStatus.data}
        isOpenToOpportunities={!!talentProfile?.open_to_opportunities}
        canContact={opportunityVisible && !isOwnProfile}
        talentProfileId={talentProfile?.id ?? null}
        writingSince={formatMonthYear(profile.created_at)}
        messagingEligibility={messagingEligibility}
      />

      {/* 2. The record -- the page's headline, and the only place that
          states how much work exists and how much of it carries evidence. */}
      <RecordPanel
        stats={{
          contributionCount: recordSummary.contributionCount,
          sourceBackedCount: recordSummary.sourceBackedCount,
          citableCount: recordSummary.citableCount,
        }}
        badges={credibilitySummary.credibilityBadges}
        displayName={displayName}
        isOwnProfile={isOwnProfile}
      />

      {/* 3. The work -- the author's selection, then everything. */}
      <FeaturedWork
        posts={featuredPosts}
        curated={curatedFeaturedPosts.length > 0}
        isOwnProfile={isOwnProfile}
        profileName={displayName}
        currentUserId={user?.id ?? null}
        action={
          isOwnProfile ? (
            <FeaturedWorkManager
              options={mergedPosts}
              initialPostIds={curatedFeaturedPosts.map((post) => post.id)}
            />
          ) : null
        }
      />

      <ProfileContentTabs
        items={mergedPosts}
        debateContributions={normalizedTopArguments}
        isOwnProfile={isOwnProfile}
      />

      <ResearchProfileCard
        displayName={displayName}
        profile={(researcherProfile as PublicResearchProfile | null) ?? null}
        projects={publicResearchProjects}
        isOwnProfile={isOwnProfile}
      />

      <OpportunityBanner
        isOwnProfile={isOwnProfile}
        userId={user?.id ?? null}
        firstName={firstName}
        opportunityTypes={talentProfile?.opportunity_types ?? []}
        talentProfileId={talentProfile?.id ?? null}
        isVisibleToViewer={opportunityVisible}
        settingsHref={`/${profile.username}#opportunity-profile`}
      />

      {showOwnOpportunityReadiness ? (
        <>
          <OpportunityReadinessCard
            summary={opportunityReadiness}
            source="profile"
          />
          <OpportunityProfileEditor
            userId={profile.id}
            talentProfile={talentProfile}
            source="profile"
          />
        </>
      ) : null}

      {/* 4. Details -- reach and platform recognition, kept below the record
          and visually quieter so popularity never reads as credibility. */}
      <ProfileDetails
        username={profile.username}
        points={profile.points}
        badges={badges}
        topicStats={topicStats}
        totalViews={totalViews}
        totalLikes={totalLikes}
        followerCount={followerCount ?? 0}
        followingCount={followingCount ?? 0}
        isOpenToOpportunities={Boolean(talentProfile?.open_to_opportunities)}
        opportunityVisible={opportunityVisible}
        opportunityReadinessStatus={opportunityReadiness.statusLabel}
        isOwnProfile={isOwnProfile}
      />
    </div>
  );
}
