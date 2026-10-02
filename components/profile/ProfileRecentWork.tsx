import ProfileWorkActions from "./ProfileWorkActions";
import ProfileWorkByline from "./ProfileWorkByline";
import type { PublicProfileIdentity } from "@/lib/profileIdentity";
import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import ProfileWorkLink from "@/components/profile/ProfileWorkLink";
import type { ProfileViewerState } from "@/lib/profileFunnel";
import type { ProfilePublication } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

export default function ProfileRecentWork({
  items,
  profileId,
  viewerState,
  isOwnProfile,
  author,
  currentUserId,
}: {
  items: ProfilePublication[];
  profileId: string;
  viewerState: ProfileViewerState;
  isOwnProfile: boolean;
  author?: PublicProfileIdentity;
  currentUserId?: string | null;
}) {
  if (!items.length) {
    return (
      <div className="profile-empty">
        <p>No published work yet.</p>
        {isOwnProfile ? (
          <Link className="focus-ring" href="/write">
            Publish your first Post or Article
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="profile-recent-work">
      {items.map((item) => {
        const article = item.kind === "article";
        const date = item.publishedAt ?? item.createdAt;
        const content = article
          ? item.title?.trim() || "Untitled Article"
          : item.excerpt || "View post";
        const tracking = {
          profileId,
          viewerState,
          surface: article
            ? ("profile_articles" as const)
            : ("profile_posts" as const),
        };

        return (
          <li key={item.id}>
            <article
              className={`profile-recent-item ${article ? "is-article" : "is-post"}`}
            >
              <div className="profile-work-content min-w-0 flex-1">
                <ProfileWorkByline author={author} />
                <div className="profile-work-kicker">
                  {article ? "Article" : "Post"}
                </div>
                {article ? (
                  <h3 className="profile-recent-title">
                    <ProfileWorkLink
                      href={`/post/${item.slug}`}
                      workId={item.id}
                      workKind={item.kind}
                      tracking={tracking}
                      className="focus-ring"
                    >
                      {content}
                    </ProfileWorkLink>
                  </h3>
                ) : (
                  <p className="profile-recent-post">
                    <ProfileWorkLink
                      href={`/post/${item.slug}`}
                      workId={item.id}
                      workKind={item.kind}
                      tracking={tracking}
                      className="focus-ring"
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
                <ProfileWorkActions work={item} currentUserId={currentUserId} />
              </div>
              {item.coverImageUrl ? (
                <PostCover
                  src={item.coverImageUrl}
                  alt=""
                  content_kind={item.kind}
                  sizes={article ? "160px" : "72px"}
                  className="profile-recent-cover"
                  imageClassName="object-cover"
                />
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
