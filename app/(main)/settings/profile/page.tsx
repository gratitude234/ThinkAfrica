import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCredibilityGraphEnabled } from "@/lib/featureFlags";
import { loadProfileCommandCenter, loadEligibleFeaturedPosts } from "@/lib/profileCommandCenterData";
import { loadMyOpportunityOutcomes } from "./outcomeActions";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { createClient } from "@/lib/supabase/server";
import ProfileCommandCenter from "./ProfileCommandCenter";

export const metadata: Metadata = {
  title: "Manage your profile",
  description: "Edit your public identity, topics, featured work, and availability.",
};

/**
 * The canonical owner workspace: `/settings/profile`.
 *
 * `/settings?tab=profile` redirects here and keeps working for bookmarks, and
 * the anchors the public profile links to (`#profile-identity`,
 * `#profile-about`, `#profile-focus`) resolve inside this page.
 *
 * Account security, passwords and notification preferences deliberately stay
 * on `/settings`. This page is about what a visitor sees, and mixing an
 * account concern into it would make "who can read this" ambiguous.
 */
export default async function ProfileCommandCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=%2Fsettings%2Fprofile");

  const [model, eligible, outcomes] = await Promise.all([
    loadProfileCommandCenter(supabase, user.id),
    loadEligibleFeaturedPosts(supabase, user.id),
    loadMyOpportunityOutcomes(),
  ]);

  if (!model) redirect("/login");

  return (
    <ProfileCommandCenter
      model={model}
      eligibleWork={eligible.map((post) => ({
        id: post.id,
        title: getPostMetadataTitle(post),
        publishedAt: post.published_at ?? post.created_at,
        isCoAuthor: post.author_id !== user.id,
      }))}
      outcomes={outcomes}
      outcomesEnabled={isCredibilityGraphEnabled()}
    />
  );
}
