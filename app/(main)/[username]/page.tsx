import "@/components/profile/profile.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProfileOverview from "@/components/profile/ProfileOverview";
import StickyProfileBar from "@/components/profile/StickyProfileBar";
import ProfileAbout from "@/components/profile/ProfileAbout";
import ProfileDraftList from "@/components/profile/ProfileDraftList";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfilePublicationList from "@/components/profile/ProfilePublicationList";
import ProfileTabs from "@/components/profile/ProfileTabs";
import { getProfileViewerState } from "@/lib/profileFunnel";
import {
  getProfileDisplayName,
  getProfileMetaDescription,
  getProfileTitle,
} from "@/lib/profileIdentity";
import { PROFILE_SHELL } from "@/lib/profileLayout";
import {
  profileTabHref,
  resolveProfilePage,
  resolveProfileTab,
} from "@/lib/profileTabs";
import { loadProfileIdentity, loadProfileView } from "@/lib/profileViewData";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  // Throws on a query failure, exactly as the page does. Answering "Profile
  // not found" because the database was unreachable would put that claim in
  // the page title and in every link preview of it.
  const profile = await loadProfileIdentity(supabase, username);
  if (!profile) return { title: "Profile not found - Indegenius" };

  const name = getProfileDisplayName(profile);
  const title = getProfileTitle(profile);
  const description = getProfileMetaDescription(profile, name);

  return {
    title,
    description,
    alternates: {
      canonical: profileTabHref(
        profile.username,
        resolveProfileTab(query) === "drafts" ? "posts" : resolveProfileTab(query)
      ),
    },
    openGraph: {
      type: "profile",
      title,
      description,
      images: [profile.avatar_url ?? "/logo.png"],
    },
    twitter: { card: "summary", title, description, images: [profile.avatar_url ?? "/logo.png"] },
  };
}

/** A writer profile: one header and one tab navigation. */
export default async function UserProfilePage({ params, searchParams }: PageProps) {
  const [{ username }, query] = await Promise.all([params, searchParams]);
  const requestedTab = resolveProfileTab(query);
  const page = requestedTab === "about" || requestedTab === "drafts"
    ? 1
    : resolveProfilePage(query.page);
  const supabase = await createClient();

  const data = await loadProfileView({
    supabase,
    username,
    tab: requestedTab,
    page,
  });

  /**
   * Null means the database answered and had nothing to show: no such
   * username, or a row the profiles policy declined to reveal. A failed query
   * never reaches here, because `loadProfileView` throws and the segment's
   * error boundary takes it. A 404 during an outage would tell every visitor
   * that every member's profile did not exist.
   */
  if (!data) notFound();

  const { profile, viewer, tab, publications, drafts } = data;
  const viewerState = getProfileViewerState({
    viewerId: viewer.viewerId,
    profileId: profile.id,
  });

  return (
    <div className={PROFILE_SHELL}>
      <ProfileHeader
        profile={{
          id: profile.id,
          username: profile.username,
          full_name: profile.full_name,
          bio: profile.bio,
          avatar_url: profile.avatar_url,
          professional_title: profile.professional_title,
          verified: profile.verified,
        }}
        followerCount={viewer.followerCount}
        followingCount={viewer.followingCount}
        isOwnProfile={viewer.isOwnProfile}
        currentUserId={viewer.viewerId}
        initialFollowing={viewer.isFollowing}
        initialBlocked={viewer.isBlocked}
      />

      <StickyProfileBar username={profile.username} name={getProfileDisplayName(profile)}
        profileId={profile.id} currentUserId={viewer.viewerId} initialFollowing={viewer.isFollowing}
        isBlocked={viewer.isBlocked} active={tab} />

      <ProfileTabs
        username={profile.username}
        active={tab}
        isOwnProfile={viewer.isOwnProfile}
      />

      <div id="profile-panel" role="tabpanel" aria-labelledby={`main-tab-${tab}`} tabIndex={0} className="profile-panel focus-ring">
        {tab === "drafts" && drafts ? (
          <ProfileDraftList initialDrafts={drafts} />
        ) : tab === "overview" ? (
          <ProfileOverview data={data} />
        ) : publications && (tab === "articles" || tab === "posts") ? (
          <ProfilePublicationList
            username={profile.username}
            profileId={profile.id}
            tab={tab}
            publications={publications}
            isOwnProfile={viewer.isOwnProfile}
            viewerState={viewerState}
          />
        ) : (
          <ProfileAbout profile={profile} isOwnProfile={viewer.isOwnProfile} />
        )}
      </div>
    </div>
  );
}
