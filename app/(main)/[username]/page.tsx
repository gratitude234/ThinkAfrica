import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CredentialsCard from "@/components/profile/CredentialsCard";
import FeaturedWork from "@/components/profile/FeaturedWork";
import OpportunityBanner from "@/components/profile/OpportunityBanner";
import ProfileHeader from "@/components/profile/ProfileHeader";
import PublicationsSection from "@/components/profile/PublicationsSection";
import TopArguments from "@/components/profile/TopArguments";
import { createClient } from "@/lib/supabase/server";
import { formatMonthYear, formatRelativeTime } from "@/lib/utils";

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
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
  points: number;
  cover_image_url: string | null;
  verified: boolean;
  verified_type: string | null;
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
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
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

interface TopArgumentRecord {
  id: string;
  content: string;
  stance: string | null;
  upvotes: number | null;
  round_number: number | null;
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

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  like: "♥",
  comment: "💬",
  debate: "⚡",
};

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
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
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
    return { title: "Profile not found - ThinkAfrika" };
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
      : `${displayName} - ThinkAfrika`,
    60
  );
  const description = profile.bio
    ? clampText(profile.bio, 155)
    : clampText(
        `${displayName}, ${profile.field_of_study ?? "student"} at ${
          profile.university ?? "their university"
        }. ${(postCount ?? 0).toLocaleString()} publications on ThinkAfrika.`,
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
      "id, username, full_name, university, field_of_study, bio, avatar_url, points, cover_image_url, verified, verified_type, created_at"
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
    { data: userBadges },
    { count: followerCount },
    { count: followingCount },
    { data: talentProfile },
    { data: topArguments },
    activityData,
    followStatus,
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, type, tags, created_at, published_at, view_count, cover_image_url, profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)"
      )
      .eq("author_id", profile.id)
      .eq("status", "published")
      .order("published_at", { ascending: false }),
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
        "id, content, stance, upvotes, round_number, debate_id, debates!debate_arguments_debate_id_fkey(id, title, status)"
      )
      .eq("author_id", profile.id)
      .order("upvotes", { ascending: false })
      .limit(3),
    isOwnProfile
      ? Promise.all([
          supabase
            .from("likes")
            .select("created_at, posts!likes_post_id_fkey(title, slug)")
            .eq("user_id", profile.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("comments")
            .select("created_at, content, posts!comments_post_id_fkey(title, slug)")
            .eq("author_id", profile.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("debate_arguments")
            .select("created_at, debates!debate_arguments_debate_id_fkey(id, title)")
            .eq("author_id", profile.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ])
      : Promise.resolve(null),
    user && user.id !== profile.id
      ? supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user.id)
          .eq("following_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const normalizedPosts = ((posts ?? []) as unknown as ProfilePostRow[]).map(
    (post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
  }));

  const badges = (userBadges ?? [])
    .map((userBadge) =>
      Array.isArray(userBadge.badges) ? userBadge.badges[0] : userBadge.badges
    )
    .filter(Boolean) as Badge[];

  const totalViews = normalizedPosts.reduce(
    (sum, post) => sum + (post.view_count ?? 0),
    0
  );

  const featuredPosts = [...normalizedPosts]
    .sort((left, right) => (right.view_count ?? 0) - (left.view_count ?? 0))
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

  const recentActivity = isOwnProfile && activityData
    ? (() => {
        const [likesResult, commentsResult, debatesResult] = activityData;
        const likeActivity = (likesResult.data ?? []).map((like) => {
          const post = Array.isArray(like.posts) ? like.posts[0] : like.posts;
          return {
            type: "like" as const,
            description: `Liked "${post?.title ?? "a post"}"`,
            link: post ? `/post/${post.slug}` : "#",
            created_at: like.created_at,
          };
        });

        const commentActivity = (commentsResult.data ?? []).map((comment) => {
          const post = Array.isArray(comment.posts)
            ? comment.posts[0]
            : comment.posts;
          return {
            type: "comment" as const,
            description: `Commented on "${post?.title ?? "a post"}"`,
            link: post ? `/post/${post.slug}` : "#",
            created_at: comment.created_at,
          };
        });

        const debateActivity = (debatesResult.data ?? []).map((argument) => {
          const debate = Array.isArray(argument.debates)
            ? argument.debates[0]
            : argument.debates;
          return {
            type: "debate" as const,
            description: `Argued in "${debate?.title ?? "a debate"}"`,
            link: debate ? `/debates/${debate.id}` : "#",
            created_at: argument.created_at,
          };
        });

        return [...likeActivity, ...commentActivity, ...debateActivity]
          .sort(
            (left, right) =>
              new Date(right.created_at).getTime() -
              new Date(left.created_at).getTime()
          )
          .slice(0, 20);
      })()
    : [];

  const displayName = getDisplayName(profile);
  const firstName = getFirstName(profile);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwnProfile}
        currentUserId={user?.id ?? null}
        initialFollowing={!!followStatus.data}
        isOpenToOpportunities={!!talentProfile?.open_to_opportunities}
        canContact={opportunityVisible && !isOwnProfile}
        talentProfileId={talentProfile?.id ?? null}
        writingSince={formatMonthYear(profile.created_at)}
      />

      <OpportunityBanner
        isOwnProfile={isOwnProfile}
        userId={user?.id ?? null}
        firstName={firstName}
        opportunityTypes={talentProfile?.opportunity_types ?? []}
        talentProfileId={talentProfile?.id ?? null}
        isVisibleToViewer={opportunityVisible}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <FeaturedWork posts={featuredPosts} />

          <PublicationsSection posts={normalizedPosts} fullName={displayName} />

          <div className="lg:hidden">
            <CredentialsCard
              profile={profile}
              badges={badges}
              postCount={normalizedPosts.length}
              totalViews={totalViews}
              followerCount={followerCount ?? 0}
              followingCount={followingCount ?? 0}
            />
          </div>

          <TopArguments argumentsList={normalizedTopArguments} />

          {isOwnProfile ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Your recent activity
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Private to you. Useful for tracking your latest engagement.
                </p>
              </div>

              {recentActivity.length === 0 ? (
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                  No recent activity yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((item, index) => (
                    <Link
                      key={`${item.type}-${item.created_at}-${index}`}
                      href={item.link}
                      className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
                    >
                      <span className="mt-0.5 text-base">
                        {ACTIVITY_TYPE_ICONS[item.type]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700">
                          {item.description}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {formatRelativeTime(item.created_at)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="hidden lg:block">
          <CredentialsCard
            profile={profile}
            badges={badges}
            postCount={normalizedPosts.length}
            totalViews={totalViews}
            followerCount={followerCount ?? 0}
            followingCount={followingCount ?? 0}
          />
        </div>
      </div>
    </div>
  );
}
