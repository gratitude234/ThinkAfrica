import ProfileWorkActions from "./ProfileWorkActions";
import Link from "next/link";
import PostCover from "@/components/post/PostCover";
import ProfileWorkLink from "@/components/profile/ProfileWorkLink";
import type { ProfileViewerState } from "@/lib/profileFunnel";
import type { ProfilePublication } from "@/lib/profileViewData";
import { formatDate } from "@/lib/utils";

export default function ProfileSelectedWork({
  work,
  profileId,
  viewerState,
  isOwnProfile,
  currentUserId,
}: {
  work: ProfilePublication | null;
  profileId: string;
  viewerState: ProfileViewerState;
  isOwnProfile: boolean;
  currentUserId?: string | null;
}) {
  if (!work) {
    if (!isOwnProfile) return null;
    return (
      <section
        className="profile-selected-empty"
        aria-labelledby="selected-work-heading"
      >
        <div className="profile-section-heading">
          <div>
            <h2 id="selected-work-heading" className="profile-section-title">
              Selected Work
            </h2>
            <p className="profile-section-note">
              Choose one published piece that best represents your work.
            </p>
          </div>
          <Link
            href="/settings/profile#selected-work"
            className="focus-ring profile-view-all"
          >
            Choose work
          </Link>
        </div>
      </section>
    );
  }

  const article = work.kind === "article";
  const date = work.publishedAt ?? work.createdAt;
  const title = article
    ? work.title?.trim() || "Untitled Article"
    : work.excerpt || work.title?.trim() || "View post";

  return (
    <section
      className="profile-selected-work"
      aria-labelledby="selected-work-heading"
    >
      <div className="profile-work-kicker">Selected Work</div>
      <article
        className={`profile-selected-work-inner ${article ? "is-article" : "is-post"}`}
      >
        <div className="profile-work-content min-w-0 flex-1">
          <div
            className={`profile-selected-heading ${work.coverImageUrl ? "has-media" : ""}`}
          >
            {work.coverImageUrl ? (
              <PostCover
                src={work.coverImageUrl}
                alt=""
                content_kind={work.kind}
                sizes="(max-width: 767px) 92px, (max-width: 1100px) 75vw, 808px"
                className="profile-selected-cover"
                imageClassName="object-cover"
              />
            ) : null}
            <div className="min-w-0">
              <p className="profile-selected-kind">
                {article ? "Article" : "Post"}
                {work.isCoAuthor ? " \u00b7 Co-authored" : null}
              </p>
              <h2 id="selected-work-heading" className="profile-selected-title">
                <ProfileWorkLink
                  href={`/post/${work.slug}`}
                  workId={work.id}
                  workKind={work.kind}
                  tracking={{
                    profileId,
                    viewerState,
                    surface: "profile_selected_work",
                  }}
                  className="focus-ring"
                >
                  {title}
                </ProfileWorkLink>
              </h2>
            </div>
          </div>
          {article && work.excerpt ? (
            <p className="profile-selected-excerpt">{work.excerpt}</p>
          ) : null}
          <p className="profile-publication-meta">
            <time dateTime={date}>{formatDate(date)}</time>
            {article && work.wordCount && work.wordCount > 0
              ? ` · ${Math.max(1, Math.ceil(work.wordCount / 200))} min read`
              : null}
          </p>
          <div className="profile-selected-footer">
            <ProfileWorkLink
              href={`/post/${work.slug}`}
              workId={work.id}
              workKind={work.kind}
              tracking={{
                profileId,
                viewerState,
                surface: "profile_selected_work",
              }}
              className="focus-ring profile-read-work"
            >
              {article ? "Read article" : "Read post"}{" "}
              <span aria-hidden="true">→</span>
            </ProfileWorkLink>
            <ProfileWorkActions work={work} currentUserId={currentUserId} />
          </div>
        </div>
      </article>
      {isOwnProfile ? (
        <Link
          href="/settings/profile#selected-work"
          className="focus-ring profile-selected-edit"
        >
          Change selected work
        </Link>
      ) : null}
    </section>
  );
}
