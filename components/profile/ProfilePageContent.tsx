import ProfileOverview, {
  OverviewAside,
} from "@/components/profile/ProfileOverview";
import StickyProfileBar from "@/components/profile/StickyProfileBar";
import ProfileAbout from "@/components/profile/ProfileAbout";
import ProfileDraftList from "@/components/profile/ProfileDraftList";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfilePublicationList from "@/components/profile/ProfilePublicationList";
import ProfileTabs from "@/components/profile/ProfileTabs";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { getProfileDisplayName } from "@/lib/profileIdentity";
import { PROFILE_SHELL } from "@/lib/profileLayout";
import type { ProfileViewData } from "@/lib/profileViewData";

/** Shared by the public route and development preview. */
export default function ProfilePageContent({
  data,
}: {
  data: ProfileViewData;
}) {
  const { profile, viewer, tab, publications, drafts } = data;
  const viewerState = getProfileViewerState({
    viewerId: viewer.viewerId,
    profileId: profile.id,
  });

  return (
    <div className={PROFILE_SHELL}>
      <div className="profile-page-grid">
        <div className="profile-primary">
          <ProfileHeader
            profile={{
              id: profile.id,
              username: profile.username,
              full_name: profile.full_name,
              bio: profile.bio,
              avatar_url: profile.avatar_url,
              cover_image_url: profile.cover_image_url,
              professional_title: profile.professional_title,
              country: profile.country,
              verified: profile.verified,
            }}
            followerCount={viewer.followerCount}
            followingCount={viewer.followingCount}
            isOwnProfile={viewer.isOwnProfile}
            currentUserId={viewer.viewerId}
            initialFollowing={viewer.isFollowing}
            initialBlocked={viewer.isBlocked}
          />

          <StickyProfileBar
            username={profile.username}
            name={getProfileDisplayName(profile)}
            profileId={profile.id}
            currentUserId={viewer.viewerId}
            initialFollowing={viewer.isFollowing}
            isBlocked={viewer.isBlocked}
            active={tab}
          />

          <ProfileTabs
            username={profile.username}
            active={tab}
            isOwnProfile={viewer.isOwnProfile}
          />

          <div
            id="profile-panel"
            role="tabpanel"
            aria-labelledby={`main-tab-${tab}`}
            tabIndex={0}
            className={`profile-panel focus-ring ${tab === "overview" ? "profile-panel-overview" : "profile-panel-reading"}`}
          >
            {tab === "drafts" && drafts ? (
              <ProfileDraftList initialDrafts={drafts} />
            ) : tab === "overview" ? (
              <ProfileOverview data={data} showAside={false} />
            ) : publications && (tab === "articles" || tab === "posts") ? (
              <ProfilePublicationList
                username={profile.username}
                profileId={profile.id}
                tab={tab}
                publications={publications}
                isOwnProfile={viewer.isOwnProfile}
                viewerState={viewerState}
                currentUserId={viewer.viewerId}
              />
            ) : (
              <ProfileAbout
                profile={profile}
                isOwnProfile={viewer.isOwnProfile}
              />
            )}
          </div>
        </div>
        {tab === "overview" ? <OverviewAside data={data} /> : null}
      </div>
    </div>
  );
}
