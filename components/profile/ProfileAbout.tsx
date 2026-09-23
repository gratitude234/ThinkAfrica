import Link from "next/link";
import type { ProfileIdentityRecord } from "@/lib/profileViewData";
import { getProfileHeadline } from "@/lib/profileIdentity";
import AboutSectionIndex from "./AboutSectionIndex";
import { joinedLabel, WriterTopics } from "./ProfileFacts";

/** Accept only explicit public web URLs; no credentials or executable schemes. */
export function safeExternalProfileUrl(value: string | null | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export default function ProfileAbout({ profile, isOwnProfile }: { profile: ProfileIdentityRecord; isOwnProfile: boolean }) {
  const bio = profile.bio?.trim();
  const headline = getProfileHeadline(profile);
  const education = Boolean(profile.field_of_study?.trim() || profile.university?.trim() || profile.graduation_year);
  const external = safeExternalProfileUrl(profile.organization_website);
  const joined = joinedLabel(profile.created_at);
  const interests = profile.interests?.some(value => value.trim());
  const sections = [
    ...(bio || headline ? [{ id: "about-profile", label: "Profile" }] : []),
    ...(education ? [{ id: "about-education", label: "Education" }] : []),
    ...(external ? [{ id: "about-links", label: "Links & external work" }] : []),
  ];
  return <section aria-label="About" className="profile-about">
    <AboutSectionIndex sections={sections} />
    <div className="profile-about-content">
      {bio || headline ? <section id="about-profile" tabIndex={-1} className="profile-about-section">
        <h2 className="profile-section-title">Profile</h2>
        {bio ? <p className="whitespace-pre-line">{bio}</p> : <p>{headline}</p>}
      </section> : null}
      {education ? <section id="about-education" tabIndex={-1} className="profile-about-section">
        <h2 className="profile-section-title">Education</h2>
        {profile.field_of_study?.trim() ? <h3>{profile.field_of_study}</h3> : null}
        {profile.university?.trim() ? <p>{profile.university}</p> : null}
        {profile.graduation_year ? <p className="profile-about-date">{profile.graduation_year}</p> : null}
      </section> : null}
      {external ? <section id="about-links" tabIndex={-1} className="profile-about-section">
        <h2 className="profile-section-title">Links & external work</h2>
        <a href={external} target="_blank" rel="noopener noreferrer" className="focus-ring profile-external-link">
          <span>{new URL(external).hostname}</span><span className="profile-external-label">EXTERNAL</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </section> : null}
      {interests ? <section className="profile-about-section"><h2 className="profile-section-title">Interests</h2><WriterTopics interests={profile.interests} /></section> : null}
      {joined ? <section className="profile-about-section"><h2 className="profile-section-title">Joined</h2><p>{joined}</p></section> : null}
      {!sections.length && !interests && !joined ? <p className="profile-empty">No profile details yet.</p> : null}
      {isOwnProfile ? <Link href="/settings/profile" className="focus-ring profile-about-edit">Edit profile</Link> : null}
    </div>
  </section>;
}
