import ProfileActivityChart from "./ProfileActivityChart";
import { safeExternalProfileUrl } from "@/lib/profileWebsite";
import Link from "next/link";
import type { ProfileViewData } from "@/lib/profileViewData";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { profileRecordHref, profileTabHref } from "@/lib/profileTabs";
import {
  formatInterestLabel,
  formatPublishedTopicLabel,
} from "@/lib/profileTopics";
import { joinedLabel } from "./ProfileFacts";
import ProfileRecentWork from "./ProfileRecentWork";
import ProfileRelatedThinkers from "./ProfileRelatedThinkers";
import ProfileSelectedWork from "./ProfileSelectedWork";

function IntellectualRecord({
  username,
  articleCount,
  postCount,
  totalPublished,
  activity,
}: {
  username: string;
  articleCount: number;
  postCount: number;
  totalPublished: number;
  activity: Array<{ month: string; count: number }>;
}) {
  const maxActivity = Math.max(0, ...activity.map((point) => point.count));
  const hasActivity = maxActivity > 0;

  return (
    <section className="profile-record" aria-labelledby="intellectual-record">
      <div className="profile-section-heading">
        <div>
          <h2 id="intellectual-record" className="profile-section-title">
            Intellectual Record
          </h2>
          <p className="profile-section-note">
            Published work built on Indegenius.
          </p>
        </div>
        <Link
          href={profileRecordHref(username)}
          className="focus-ring profile-view-all"
        >
          View full record
        </Link>
      </div>
      <dl className="profile-record-metrics">
        <div>
          <dt>Articles</dt>
          <dd>{articleCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Posts</dt>
          <dd>{postCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Published works</dt>
          <dd>{totalPublished.toLocaleString()}</dd>
        </div>
      </dl>

      <details className="profile-activity">
        <summary className="focus-ring profile-activity-toggle">
          <span>View activity</span>
          <span className="profile-activity-period">Last 12 months</span>
        </summary>
        <div className="profile-activity-heading">
          <h3 id="profile-activity-title">Last 12 months</h3>
          <span>
            {hasActivity
              ? "Published works by month"
              : "No recent publications"}
          </span>
        </div>
        <ProfileActivityChart activity={activity} />
      </details>

      <div
        className="profile-record-links"
        aria-label="Browse intellectual record"
      >
        <Link href={profileTabHref(username, "posts")} className="focus-ring">
          View Posts
        </Link>
        <Link
          href={profileTabHref(username, "articles")}
          className="focus-ring"
        >
          View Articles
        </Link>
      </div>
    </section>
  );
}

function EmptyOverview({ data }: { data: ProfileViewData }) {
  const name = data.profile.full_name?.trim() || data.profile.username;

  if (data.viewer.isOwnProfile) {
    return (
      <section
        className="profile-empty-overview"
        aria-labelledby="empty-record-heading"
      >
        <p className="profile-work-kicker">
          Your profile starts with your work
        </p>
        <h2 id="empty-record-heading">Build your intellectual record</h2>
        <p>
          Publish a Post or Article and it will begin shaping your Recent Work,
          writing topics and Intellectual Record automatically.
        </p>
        <div className="profile-empty-actions">
          <Link href="/write" className="focus-ring profile-empty-primary">
            Write a Post
          </Link>
          <Link
            href="/write?editor=article"
            className="focus-ring profile-empty-secondary"
          >
            Write an Article
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className="profile-empty-overview"
      aria-labelledby="empty-record-heading"
    >
      <h2 id="empty-record-heading">No published work yet</h2>
      <p>{name} hasn’t published a Post or Article on Indegenius yet.</p>
    </section>
  );
}

export function OverviewAside({ data }: { data: ProfileViewData }) {
  const { profile } = data;
  const website = safeExternalProfileUrl(profile.organization_website);
  const education = [
    profile.field_of_study?.trim(),
    profile.university?.trim(),
    profile.graduation_year,
  ]
    .filter(Boolean)
    .join(" · ");
  const interests = [
    ...new Map(
      (profile.interests ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ];
  const joined = joinedLabel(profile.created_at);
  const writingTopics = data.overview?.writingTopics ?? [];
  const relatedThinkers = data.overview?.relatedThinkers ?? [];

  return (
    <aside className="profile-overview-aside" aria-label="Profile context">
      {education ||
      profile.country?.trim() ||
      joined ||
      website ? (
        <section className="profile-aside-section profile-aside-details">
          <h2>About</h2>
          <dl className="profile-aside-facts">
            {education ? (
              <div>
                <dt>Education</dt>
                <dd>{education}</dd>
              </div>
            ) : null}
            {profile.country?.trim() ? (
              <div>
                <dt>Location</dt>
                <dd>{profile.country.trim()}</dd>
              </div>
            ) : null}
            {website ? (
              <div>
                <dt>Website</dt>
                <dd>
                  <a
                    className="focus-ring profile-aside-website"
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {new URL(website).hostname}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </dd>
              </div>
            ) : null}
            {joined ? (
              <div>
                <dt>Joined</dt>
                <dd>{joined}</dd>
              </div>
            ) : null}
          </dl>
          <Link
            href={profileTabHref(profile.username, "about")}
            className="focus-ring profile-aside-link"
          >
            View full About
          </Link>
        </section>
      ) : null}

      {writingTopics.length ? (
        <section className="profile-aside-section">
          <h2>Writes about</h2>
          <p className="profile-aside-note">From published work.</p>
          <ul className="profile-writing-topic-list">
            {writingTopics.map((topic) => (
              <li key={topic.key}>
                <Link
                  href={`/topics/${encodeURIComponent(topic.key)}`}
                  className="focus-ring"
                  title={`${topic.count.toLocaleString()} published work${topic.count === 1 ? "" : "s"}`}
                >
                  {formatPublishedTopicLabel(topic.key)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ProfileRelatedThinkers
        thinkers={relatedThinkers}
        currentUserId={data.viewer.viewerId}
      />

      {interests.length ? (
        <section className="profile-aside-section">
          <h2>Interests</h2>
          <p className="profile-aside-note">Reading interests.</p>
          <ul className="profile-interest-list">
            {interests.map((interest) => (
              <li key={interest}>{formatInterestLabel(interest)}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

export default function ProfileOverview({
  data,
  showAside = true,
}: {
  data: ProfileViewData;
  showAside?: boolean;
}) {
  const { profile, viewer, overview } = data;
  if (!overview) return null;
  const viewerState = getProfileViewerState({
    viewerId: viewer.viewerId,
    profileId: profile.id,
  });

  return (
    <div
      className={
        showAside ? "profile-overview-grid" : "profile-overview-content"
      }
    >
      <div className="profile-overview-main">
        {overview.totalPublished === 0 ? (
          <EmptyOverview data={data} />
        ) : (
          <>
            <ProfileSelectedWork
              work={overview.selectedWork}
              profileId={profile.id}
              viewerState={viewerState}
              currentUserId={viewer.viewerId}
              isOwnProfile={viewer.isOwnProfile}
            />

            <section
              className="profile-section profile-recent-section"
              aria-labelledby="recent-work"
            >
              <div className="profile-section-heading">
                <h2 id="recent-work" className="profile-section-title">
                  Recent Work
                </h2>
                <Link
                  href={profileRecordHref(profile.username)}
                  className="focus-ring profile-view-all"
                >
                  View all work
                </Link>
              </div>
              <ProfileRecentWork
                items={overview.recentWork}
                profileId={profile.id}
                viewerState={viewerState}
                currentUserId={viewer.viewerId}
                isOwnProfile={viewer.isOwnProfile}
              />
            </section>

            <IntellectualRecord
              username={profile.username}
              articleCount={overview.articleCount}
              postCount={overview.postCount}
              totalPublished={overview.totalPublished}
              activity={overview.activity}
            />
          </>
        )}
      </div>
      {showAside ? <OverviewAside data={data} /> : null}
    </div>
  );
}
