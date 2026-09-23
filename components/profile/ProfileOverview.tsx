import Link from "next/link";
import type { ProfileViewData } from "@/lib/profileViewData";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { profileTabHref } from "@/lib/profileTabs";
import ProfilePublicationList from "./ProfilePublicationList";
import { AtAGlance, WriterTopics } from "./ProfileFacts";

export default function ProfileOverview({ data }: { data: ProfileViewData }) {
  const { profile, viewer, overview } = data;
  if (!overview) return null;
  const viewerState = getProfileViewerState({ viewerId: viewer.viewerId, profileId: profile.id });
  return <>
    {(["articles", "posts"] as const).map(tab => <section key={tab} className="profile-section" aria-labelledby={`recent-${tab}`}>
      <div className="profile-section-heading">
        <h2 id={`recent-${tab}`} className="profile-section-title">Recent {tab}</h2>
        <Link className="focus-ring profile-view-all" href={profileTabHref(profile.username, tab)} scroll={false}>View all<span className="sr-only"> {tab}</span></Link>
      </div>
      <ProfilePublicationList username={profile.username} profileId={profile.id} tab={tab}
        publications={overview[tab]} isOwnProfile={viewer.isOwnProfile} viewerState={viewerState} preview />
    </section>)}
    {profile.interests?.some(interest => interest.trim()) ? <section className="profile-section" aria-labelledby="writes-about">
      <h2 id="writes-about" className="profile-section-title">Writes about</h2>
      <WriterTopics interests={profile.interests} />
    </section> : null}
    <AtAGlance profile={profile} />
  </>;
}
