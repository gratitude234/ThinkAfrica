import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import ProfileWorkLink from "@/components/profile/ProfileWorkLink";
import type { ProfileViewerState } from "@/lib/profileFunnel";
import { profileRecordHref } from "@/lib/profileTabs";
import { formatPublishedTopicLabel } from "@/lib/profileTopics";
import type { ProfileRecordPage } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

function yearFor(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Earlier" : String(date.getUTCFullYear());
}

function groupedByYear(items: ProfileRecordPage["items"]) {
  const groups = new Map<string, ProfileRecordPage["items"]>();
  for (const item of items) {
    const year = yearFor(item.publishedAt ?? item.createdAt);
    const group = groups.get(year) ?? [];
    group.push(item);
    groups.set(year, group);
  }
  return [...groups.entries()];
}

export default function ProfileRecordList({
  username,
  displayName,
  profileId,
  record,
  viewerState,
  isOwnProfile,
}: {
  username: string;
  displayName: string;
  profileId: string;
  record: ProfileRecordPage;
  viewerState: ProfileViewerState;
  isOwnProfile: boolean;
}) {
  const groups = groupedByYear(record.items);

  return (
    <div className="profile-record-page">
      <header className="profile-record-page-header">
        <Link href={`/${username}`} className="focus-ring profile-record-back">
          ← Back to {displayName}
        </Link>
        <div className="profile-record-page-title-row">
          <div>
            <p className="profile-work-kicker">Public work history</p>
            <h1>Intellectual Record</h1>
            <p className="profile-record-page-intro">
              Every published Post and Article by {displayName}, newest first.
            </p>
          </div>
        </div>

        <dl className="profile-record-page-metrics">
          <div>
            <dt>Articles</dt>
            <dd>{record.articleCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Posts</dt>
            <dd>{record.postCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Published works</dt>
            <dd>{record.totalPublished.toLocaleString()}</dd>
          </div>
        </dl>

        {record.writingTopics.length ? (
          <section className="profile-record-topics" aria-labelledby="record-writing-topics">
            <div>
              <h2 id="record-writing-topics">Writes about</h2>
              <p>Derived from published Posts and Articles.</p>
            </div>
            <ul>
              {record.writingTopics.map((topic) => (
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
      </header>

      {groups.length ? (
        <div className="profile-record-years">
          {groups.map(([year, items]) => (
            <section key={year} className="profile-record-year" aria-labelledby={`record-year-${year}`}>
              <h2 id={`record-year-${year}`}>{year}</h2>
              <ul>
                {items.map((item) => {
                  const article = item.kind === "article";
                  const date = item.publishedAt ?? item.createdAt;
                  const content = article
                    ? item.title?.trim() || "Untitled Article"
                    : item.excerpt || "View post";

                  return (
                    <li key={item.id}>
                      <article className={`profile-record-item ${article ? "is-article" : "is-post"}`}>
                        <div className="min-w-0 flex-1">
                          <div className="profile-work-kicker">{article ? "Article" : "Post"}</div>
                          {article ? (
                            <h3>
                              <ProfileWorkLink
                                href={`/post/${item.slug}`}
                                workId={item.id}
                                workKind={item.kind}
                                tracking={{ profileId, viewerState, surface: "profile_record" }}
                                className="focus-ring stretch-target after:z-10"
                              >
                                {content}
                              </ProfileWorkLink>
                            </h3>
                          ) : (
                            <p className="profile-record-post-text">
                              <ProfileWorkLink
                                href={`/post/${item.slug}`}
                                workId={item.id}
                                workKind={item.kind}
                                tracking={{ profileId, viewerState, surface: "profile_record" }}
                                className="focus-ring stretch-target after:z-10"
                              >
                                {content}
                              </ProfileWorkLink>
                            </p>
                          )}
                          {article && item.excerpt ? (
                            <p className="profile-standfirst">{item.excerpt}</p>
                          ) : null}
                          <p className="profile-publication-meta">
                            <time dateTime={date}>{formatDate(date)}</time>
                            {article && item.wordCount && item.wordCount > 0
                              ? ` · ${Math.max(1, Math.ceil(item.wordCount / 200))} min read`
                              : null}
                          </p>
                        </div>
                        {item.coverImageUrl ? (
                          <PostCover
                            src={item.coverImageUrl}
                            alt=""
                            content_kind={item.kind}
                            sizes={article ? "132px" : "64px"}
                            className="profile-record-cover"
                            imageClassName="object-cover"
                          />
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <section className="profile-record-empty" aria-labelledby="record-empty-heading">
          <h2 id="record-empty-heading">
            {isOwnProfile ? "Your record starts with your first published piece" : "No published work yet"}
          </h2>
          <p>
            {isOwnProfile
              ? "Publish a Post or Article and it will appear here automatically."
              : `${displayName} hasn’t published a Post or Article on Indegenius yet.`}
          </p>
          {isOwnProfile ? (
            <div className="profile-empty-actions">
              <Link href="/write" className="focus-ring profile-empty-primary">Write a Post</Link>
              <Link href="/write?editor=article" className="focus-ring profile-empty-secondary">Write an Article</Link>
            </div>
          ) : null}
        </section>
      )}

      {(record.hasPreviousPage || record.hasNextPage) ? (
        <nav aria-label="Intellectual Record pages" className="profile-pagination profile-record-pagination">
          {record.hasPreviousPage ? (
            <Link href={profileRecordHref(username, record.page - 1)} className="focus-ring">Newer</Link>
          ) : <span />}
          {record.hasNextPage ? (
            <Link href={profileRecordHref(username, record.page + 1)} className="focus-ring">Older</Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
