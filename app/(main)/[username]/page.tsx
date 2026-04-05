import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProfileCard from "@/components/profile/ProfileCard";
import PostCard from "@/components/post/PostCard";
import type { PostCardData } from "@/components/post/PostCard";
import FollowButton from "./FollowButton";
import { formatDate } from "@/lib/utils";
import OpportunitiesTab from "./OpportunitiesTab";

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  like: "❤️",
  comment: "💬",
  debate: "⚡",
};

export default async function UserProfilePage({
  params,
  searchParams,
}: PageProps) {
  const { username } = await params;
  const { tab = "posts" } = await searchParams;
  const supabase = await createClient();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "id, username, full_name, university, field_of_study, bio, avatar_url, points"
    )
    .eq("username", username)
    .single();

  if (!profile) notFound();

  // Current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parallel queries for base data
  const [
    { data: posts },
    { data: userBadges },
    { count: followerCount },
    { count: followingCount },
    { count: likeCount },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, slug, excerpt, type, tags, created_at, published_at, profiles!posts_author_id_fkey (username, full_name, university, avatar_url)"
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

    // Total likes received on their posts
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .in(
        "post_id",
        // we need post ids — handled below after posts fetch
        []
      ),
  ]);

  // Fetch total likes received (using post ids)
  const postIds = (posts ?? []).map((p) => p.id);
  let totalLikesReceived = 0;
  if (postIds.length > 0) {
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .in("post_id", postIds);
    totalLikesReceived = count ?? 0;
  }

  const badges = (userBadges ?? [])
    .map((ub) => (Array.isArray(ub.badges) ? ub.badges[0] : ub.badges))
    .filter(Boolean) as {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
  }[];

  // Is current user following?
  let isFollowing = false;
  if (user && user.id !== profile.id) {
    const { data: followRow } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .single();
    isFollowing = !!followRow;
  }

  const feedPosts: PostCardData[] = (posts ?? []).map((p) => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
  }));

  // Debates tab data
  let debateParticipations: {
    debate_id: string;
    debates: { id: string; title: string; status: string } | null;
    created_at: string;
  }[] = [];

  if (tab === "debates") {
    const { data } = await supabase
      .from("debate_arguments")
      .select("debate_id, created_at, debates!debate_arguments_debate_id_fkey(id, title, status)")
      .eq("author_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Deduplicate by debate_id
    const seen = new Set<string>();
    debateParticipations = (data ?? [])
      .filter((d) => {
        if (seen.has(d.debate_id)) return false;
        seen.add(d.debate_id);
        return true;
      })
      .map((d) => ({
        ...d,
        debates: Array.isArray(d.debates) ? d.debates[0] : d.debates,
      }));
  }

  // Activity tab data
  let activity: {
    type: "like" | "comment" | "debate";
    description: string;
    link: string;
    created_at: string;
  }[] = [];

  if (tab === "activity") {
    const [{ data: recentLikes }, { data: recentComments }, { data: recentArgs }] =
      await Promise.all([
        supabase
          .from("likes")
          .select(
            "created_at, posts!likes_post_id_fkey(title, slug)"
          )
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("comments")
          .select(
            "created_at, content, posts!comments_post_id_fkey(title, slug)"
          )
          .eq("author_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("debate_arguments")
          .select(
            "created_at, debates!debate_arguments_debate_id_fkey(id, title)"
          )
          .eq("author_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    const likeActivity = (recentLikes ?? []).map((l) => {
      const post = Array.isArray(l.posts) ? l.posts[0] : l.posts;
      return {
        type: "like" as const,
        description: `Liked "${post?.title ?? "a post"}"`,
        link: post ? `/post/${post.slug}` : "#",
        created_at: l.created_at,
      };
    });

    const commentActivity = (recentComments ?? []).map((c) => {
      const post = Array.isArray(c.posts) ? c.posts[0] : c.posts;
      return {
        type: "comment" as const,
        description: `Commented on "${post?.title ?? "a post"}"`,
        link: post ? `/post/${post.slug}` : "#",
        created_at: c.created_at,
      };
    });

    const debateActivity = (recentArgs ?? []).map((a) => {
      const debate = Array.isArray(a.debates) ? a.debates[0] : a.debates;
      return {
        type: "debate" as const,
        description: `Argued in "${debate?.title ?? "a debate"}"`,
        link: debate ? `/debates/${debate.id}` : "#",
        created_at: a.created_at,
      };
    });

    activity = [...likeActivity, ...commentActivity, ...debateActivity]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 20);
  }

  // Opportunities tab data
  let talentProfile: {
    id: string; open_to_opportunities: boolean; opportunity_types: string[] | null;
    cv_url: string | null; linkedin_url: string | null; skills: string[] | null; visibility: string;
  } | null = null;
  if (tab === "opportunities" || (user?.id === profile.id)) {
    const { data } = await supabase
      .from("talent_profiles")
      .select("id, open_to_opportunities, opportunity_types, cv_url, linkedin_url, skills, visibility")
      .eq("user_id", profile.id)
      .single();
    talentProfile = data;
  }

  const isOwnProfile = user?.id === profile.id;

  const tabLinks = [
    { label: "Posts", value: "posts" },
    { label: "Debates", value: "debates" },
    { label: "Activity", value: "activity" },
    { label: "Opportunities", value: "opportunities" },
  ];

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Sidebar */}
      <div className="lg:col-span-1">
        <ProfileCard
          profile={profile}
          badges={badges}
          postCount={feedPosts.length}
          followerCount={followerCount ?? 0}
          followingCount={followingCount ?? 0}
        >
          <FollowButton
            targetUserId={profile.id}
            currentUserId={user?.id ?? null}
            initialFollowing={isFollowing}
          />
        </ProfileCard>

        {/* Stats row */}
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Stats
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">
                {feedPosts.length}
              </p>
              <p className="text-xs text-gray-400">Posts</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">
                {totalLikesReceived}
              </p>
              <p className="text-xs text-gray-400">Likes</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-emerald-brand">
                {profile.points}
              </p>
              <p className="text-xs text-gray-400">Points</p>
            </div>
            <div className="text-center bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">
                {followerCount ?? 0}
              </p>
              <p className="text-xs text-gray-400">Followers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:col-span-2">
        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {tabLinks.map((t) => {
            const active = tab === t.value;
            return (
              <Link
                key={t.value}
                href={`/${username}?tab=${t.value}`}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  active
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>

        {/* Posts tab */}
        {tab === "posts" && (
          <>
            {feedPosts.length === 0 ? (
              <div className="text-gray-400 text-sm py-8 text-center">
                No published posts yet.
              </div>
            ) : (
              <div className="space-y-4">
                {feedPosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </>
        )}

        {/* Debates tab */}
        {tab === "debates" && (
          <>
            {debateParticipations.length === 0 ? (
              <div className="text-gray-400 text-sm py-8 text-center">
                No debate participations yet.
              </div>
            ) : (
              <div className="space-y-3">
                {debateParticipations.map((d) => {
                  const debate = d.debates;
                  if (!debate) return null;
                  return (
                    <Link
                      key={`${d.debate_id}-${d.created_at}`}
                      href={`/debates/${debate.id}`}
                      className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                    >
                      <span className="text-xl flex-shrink-0">⚡</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 hover:text-emerald-brand transition-colors">
                          {debate.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              debate.status === "open"
                                ? "bg-emerald-100 text-emerald-700"
                                : debate.status === "active"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {debate.status}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatDate(d.created_at)}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Activity tab */}
        {tab === "activity" && (
          <>
            {activity.length === 0 ? (
              <div className="text-gray-400 text-sm py-8 text-center">
                No recent activity.
              </div>
            ) : (
              <div className="space-y-2">
                {activity.map((item, i) => (
                  <Link
                    key={i}
                    href={item.link}
                    className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {ACTIVITY_TYPE_ICONS[item.type] ?? "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(item.created_at)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
        {/* Opportunities tab */}
        {tab === "opportunities" && (
          <OpportunitiesTab
            profileId={profile.id}
            isOwnProfile={isOwnProfile}
            talentProfile={talentProfile}
            userId={user?.id ?? null}
          />
        )}
      </div>
    </div>
  );
}
