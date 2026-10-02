import { notFound } from "next/navigation";
import { AppChromeProvider } from "@/app/(main)/AppChromeProvider";
import NavigationShell from "@/app/(main)/NavigationShell";
import AppShell from "@/app/(main)/AppShell";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileTabs from "@/components/profile/ProfileTabs";
import StickyProfileBar from "@/components/profile/StickyProfileBar";
import ProfileOverview from "@/components/profile/ProfileOverview";
import ProfileAbout from "@/components/profile/ProfileAbout";
import ProfilePublicationList from "@/components/profile/ProfilePublicationList";
import ProfileDraftList from "@/components/profile/ProfileDraftList";
import { PROFILE_FIXTURE, PROFILE_DRAFT_FIXTURES, profileFixturePage } from "@/lib/devFixtures/profileFixtures";
import { resolveProfileTab } from "@/lib/profileTabs";
import type { ProfileViewData } from "@/lib/profileViewData";
import { PROFILE_SHELL } from "@/lib/profileLayout";
import PreviewFrame from "./PreviewFrame";
import "@/components/profile/profile.css";

export const metadata = { title: "Writer profile preview (development only)", robots: { index: false, follow: false } };

export default async function WriterProfilePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  const own = query.owner === "1";
  const empty = query.empty === "1";
  const sparse = query.sparse === "1";
  const profile = { ...PROFILE_FIXTURE,
    ...(sparse ? { bio: "Writing about everyday life.", professional_title: null, university: null, field_of_study: null, graduation_year: null, country: null, interests: [], organization_website: null, verified: false } : {}),
    ...(query.long === "1" ? { full_name: "Amara Chiamaka Okafor-Adetunji", username: "averylongwriterusernametocheckoverflow" } : {}),
  };
  const requested = resolveProfileTab(query);
  const tab = requested === "drafts" && !own ? "overview" : requested;
  const articles = profileFixturePage("article", empty);
  const posts = profileFixturePage("post", empty);
  const viewer = { viewerId: own ? profile.id : null, isOwnProfile: own, isFollowing: query.following === "1", isBlocked: false, followerCount: 128, followingCount: 42 };
  const recentWork = [...articles.items, ...posts.items]
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt))
    .slice(0, 6);
  const data: ProfileViewData = {
    profile,
    viewer,
    tab,
    overview: {
      selectedWork: empty ? null : articles.items[0] ?? posts.items[0] ?? null,
      recentWork,
      articleCount: empty ? 0 : 24,
      postCount: empty ? 0 : 86,
      totalPublished: empty ? 0 : 110,
      activity: [
        { month: "2025-11", count: empty ? 0 : 3 },
        { month: "2025-12", count: empty ? 0 : 5 },
        { month: "2026-01", count: empty ? 0 : 4 },
        { month: "2026-02", count: empty ? 0 : 6 },
        { month: "2026-03", count: empty ? 0 : 5 },
        { month: "2026-04", count: empty ? 0 : 7 },
        { month: "2026-05", count: empty ? 0 : 8 },
        { month: "2026-06", count: empty ? 0 : 7 },
        { month: "2026-07", count: empty ? 0 : 9 },
        { month: "2026-08", count: empty ? 0 : 8 },
        { month: "2026-09", count: empty ? 0 : 10 },
        { month: "2026-10", count: empty ? 0 : 6 },
      ],
      writingTopics: empty ? [] : [
        { key: "politics & governance", count: 18 },
        { key: "education policy", count: 12 },
        { key: "african culture", count: 9 },
        { key: "youth", count: 7 },
      ],
      relatedThinkers: empty ? [] : [
        { id: "fixture-thinker-1", username: "tundereads", fullName: "Tunde Adebayo", avatarUrl: null, professionalTitle: "Policy researcher", sharedTopics: ["politics & governance", "education policy"], ownerFollows: true, followsOwner: true, viewerFollows: false, latestPublishedAt: "2026-10-01T09:00:00Z" },
        { id: "fixture-thinker-2", username: "aminathinks", fullName: "Amina Yusuf", avatarUrl: null, professionalTitle: "Writer · Education", sharedTopics: ["education policy"], ownerFollows: false, followsOwner: true, viewerFollows: false, latestPublishedAt: "2026-09-29T09:00:00Z" },
        { id: "fixture-thinker-3", username: "kwamemensah", fullName: "Kwame Mensah", avatarUrl: null, professionalTitle: "Urban policy writer", sharedTopics: ["politics & governance"], ownerFollows: false, followsOwner: false, viewerFollows: false, latestPublishedAt: "2026-09-27T09:00:00Z" },
      ],
    },
    publications: null,
    drafts: own ? (empty ? [] : PROFILE_DRAFT_FIXTURES) : null,
  };
  return <AppChromeProvider>
    <NavigationShell user={null} profile={null} isAdmin={false} />
    <AppShell showGuestBanner={false} userId={null} username={null}>
      <PreviewFrame><div className={PROFILE_SHELL}>
        <ProfileHeader profile={profile} followerCount={128} followingCount={42} isOwnProfile={own}
          currentUserId={viewer.viewerId} initialFollowing={viewer.isFollowing} />
        <StickyProfileBar username={profile.username} name={profile.full_name || profile.username} profileId={profile.id}
          currentUserId={viewer.viewerId} initialFollowing={viewer.isFollowing} isBlocked={false} active={tab} />
        <ProfileTabs username={profile.username} active={tab} isOwnProfile={own} />
        <div id="profile-panel" role="tabpanel" aria-labelledby={`main-tab-${tab}`} tabIndex={0} className={`profile-panel ${tab === "overview" ? "profile-panel-overview" : "profile-panel-reading"}`}>
          {tab === "overview" ? <ProfileOverview data={data} /> : tab === "about" ? <ProfileAbout profile={profile} isOwnProfile={own} />
            : tab === "drafts" && data.drafts ? <ProfileDraftList initialDrafts={data.drafts} />
            : tab === "articles" || tab === "posts" ? <ProfilePublicationList username={profile.username} profileId={profile.id}
              tab={tab} publications={tab === "articles" ? articles : posts} isOwnProfile={own} viewerState={own ? "owner" : "anonymous"} /> : null}
        </div>
      </div></PreviewFrame>
    </AppShell>
  </AppChromeProvider>;
}
