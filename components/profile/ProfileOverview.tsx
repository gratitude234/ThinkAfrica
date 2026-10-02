import Link from "next/link";
import type { ProfileViewData } from "@/lib/profileViewData";
import { getProfileViewerState } from "@/lib/profileFunnel";
import { profileRecordHref, profileTabHref } from "@/lib/profileTabs";
import { formatInterestLabel, formatPublishedTopicLabel } from "@/lib/profileTopics";
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
        <Link href={profileRecordHref(username)} className="focus-ring profile-view-all">
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

      <div className="profile-activity" aria-labelledby="profile-activity-title">
        <div className="profile-activity-heading">
          <h3 id="profile-activity-title">Last 12 months</h3>
          <span>{hasActivity ? "Published works by month" : "No recent publications"}</span>
        </div>
        {hasActivity ? (
          <ol className="profile-activity-chart" aria-label="Published works by month">
            {activity.map((point) => {
              const date = new Date(`${point.month}-01T00:00:00.000Z`);
              const label = Number.isNaN(date.getTime())
                ? point.month
                : new Intl.DateTimeFormat("en", { month: "short" }).format(date);
              const height = Math.max(8, Math.round((point.count / maxActivity) * 52));
              return (
                <li key={point.month} title={`${label}: ${point.count.toLocaleString()} published`}>
                  <span className="sr-only">
                    {`${label}: ${point.count.toLocaleString()} published work${point.count === 1 ? "" : "s"}`}
                  </span>
                  <span
                    aria-hidden="true"
                    className="profile-activity-bar"
                    style={{ height: `${height}px` }}
                  />
                  <span aria-hidden="true" className="profile-activity-label">
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="profile-activity-empty">
            This record will grow as new Posts and Articles are published.
          </p>
        )}
      </div>

      <div className="profile-record-links" aria-label="Browse intellectual record">
        <Link href={profileTabHref(username, "posts")} className="focus-ring">
          View Posts
        </Link>
        <Link href={profileTabHref(username, "articles")} className="focus-ring">
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
      <section className="profile-empty-overview" aria-labelledby="empty-record-heading">
        <p className="profile-work-kicker">Your profile starts with your work</p>
        <h2 id="empty-record-heading">Build your intellectual record</h2>
        <p>
          Publish a Post or Article and it will begin shaping your Recent Work,
          writing topics and Intellectual Record automatically.
        </p>
        <div className="profile-empty-actions">
          <Link href="/write" className="focus-ring profile-empty-primary">
            Write a Post
          </Link>
          <Link href="/write?editor=article" className="focus-ring profile-empty-secondary">
            Write an Article
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="profile-empty-overview" aria-labelledby="empty-record-heading">
      <h2 id="empty-record-heading">No published work yet</h2>
      <p>{name} hasn’t published a Post or Article on Indegenius yet.</p>
    </section>
  );
}

function OverviewAside({ data }: { data: ProfileViewData }) {
  const { profile } = data;
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
        .map((value) => [value.toLowerCase(), value])
    ).values(),
  ];
  const joined = joinedLabel(profile.created_at);
  const writingTopics = data.overview?.writingTopics ?? [];
  const relatedThinkers = data.overview?.relatedThinkers ?? [];

  return (
    <aside className="profile-overview-aside" aria-label="Profile context">
      {education || profile.country?.trim() || joined ? (
        <section className="profile-aside-section">
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
            {joined ? (
              <div>
                <dt>Joined</dt>
                <dd>{joined}</dd>
              </div>
            ) : null}
          </dl>
          <Link href={profileTabHref(profile.username, "about")} className="focus-ring profile-aside-link">
            View full About
          </Link>
        </section>
      ) : null}

      {writingTopics.length ? (
        <section className="profile-aside-section">
          <h2>Writes about</h2>
          <p className="profile-aside-note">Derived from published Posts and Articles.</p>
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
          <p className="profile-aside-note">Topics this member chose for their reading feed.</p>
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

export default function ProfileOverview({ data }: { data: ProfileViewData }) {
  const { profile, viewer, overview } = data;
  if (!overview) return null;
  const viewerState = getProfileViewerState({
    viewerId: viewer.viewerId,
    profileId: profile.id,
  });

  return (
    <div className="profile-overview-grid">
      <div className="profile-overview-main">
        {overview.totalPublished === 0 ? (
          <EmptyOverview data={data} />
        ) : (
          <>
            <ProfileSelectedWork
              work={overview.selectedWork}
              profileId={profile.id}
              viewerState={viewerState}
              isOwnProfile={viewer.isOwnProfile}
            />

            <IntellectualRecord
              username={profile.username}
              articleCount={overview.articleCount}
              postCount={overview.postCount}
              totalPublished={overview.totalPublished}
              activity={overview.activity}
            />

            <section className="profile-section profile-recent-section" aria-labelledby="recent-work">
              <div className="profile-section-heading">
                <h2 id="recent-work" className="profile-section-title">
                  Recent Work
                </h2>
              </div>
              <ProfileRecentWork
                items={overview.recentWork}
                profileId={profile.id}
                viewerState={viewerState}
                isOwnProfile={viewer.isOwnProfile}
              />
            </section>
          </>
        )}
      </div>
      <OverviewAside data={data} />
    </div>
  );
}
