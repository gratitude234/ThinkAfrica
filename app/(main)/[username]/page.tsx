import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileCard from "@/components/profile/ProfileCard";
import PostCard from "@/components/post/PostCard";
import type { PostCardData } from "@/components/post/PostCard";
import FollowButton from "./FollowButton";

interface PageProps {
  params: Promise<{ username: string }>;
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = await params;
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

  // Fetch published posts
  const { data: posts } = await supabase
    .from("posts")
    .select(
      "id, title, slug, excerpt, type, tags, created_at, published_at, profiles!posts_author_id_fkey (username, full_name, university, avatar_url)"
    )
    .eq("author_id", profile.id)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  // Fetch badges
  const { data: userBadges } = await supabase
    .from("user_badges")
    .select("badge_id, awarded_at, badges (id, name, description, icon)")
    .eq("user_id", profile.id);

  const badges = (userBadges ?? [])
    .map((ub) => (Array.isArray(ub.badges) ? ub.badges[0] : ub.badges))
    .filter(Boolean) as { id: string; name: string; description: string | null; icon: string | null }[];

  // Follower/following counts
  const { count: followerCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("following_id", profile.id);

  const { count: followingCount } = await supabase
    .from("follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", profile.id);

  // Is current user following this profile?
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
      </div>

      {/* Posts */}
      <div className="lg:col-span-2">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Published posts
        </h2>
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
      </div>
    </div>
  );
}
